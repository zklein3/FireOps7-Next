'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission, hasPermissionForDepartment } from '@/lib/permissions'
import { logError, logEvent } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

export async function savePublicSiteSettings(formData: FormData) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me?.is_sys_admin) return { error: 'Unauthorized.' }

  const department_id      = formData.get('department_id') as string
  const public_site_enabled = formData.get('public_site_enabled') === 'true'
  const public_slug        = (formData.get('public_slug') as string)?.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || null
  const public_phone       = (formData.get('public_phone') as string)?.trim() || null
  const public_email       = (formData.get('public_email') as string)?.trim() || null
  const public_address     = (formData.get('public_address') as string)?.trim() || null
  const public_tagline     = (formData.get('public_tagline') as string)?.trim() || null
  const public_about            = (formData.get('public_about') as string)?.trim() || null
  const burn_permit_restrictions = (formData.get('burn_permit_restrictions') as string)?.trim() || null
  const burn_permit_county_info  = (formData.get('burn_permit_county_info') as string)?.trim() || null

  if (public_site_enabled && !public_slug) return { error: 'A URL slug is required to enable the public site.' }

  const { error: dbErr } = await adminClient
    .from('departments')
    .update({ public_site_enabled, public_slug, public_phone, public_email, public_address, public_tagline, public_about, burn_permit_restrictions, burn_permit_county_info })
    .eq('id', department_id)

  if (dbErr) {
    if (dbErr.code === '23505') return { error: 'That slug is already in use by another department.' }
    await logError(dbErr, `/admin/dept/${department_id}`)
    return { error: dbErr.message }
  }

  revalidatePath(`/admin/dept/${department_id}`)
  return { success: true, slug: public_slug }
}

// Dept-admin self-service on/off — deliberately narrower than
// savePublicSiteSettings above (which also edits the citizen-facing content
// fields and stays sys-admin only for now). This only flips the flag + sets
// a slug if one isn't already set, same shape as setHoseTestingConfig, since
// hose testing and the public site share the one public_slug column.
export async function setPublicSiteEnabled(enabled: boolean, slug: string | null) {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!(await hasPermission(ctx, 'manage_department_settings'))) return { error: 'Only admins can update department settings.' }
  if (!ctx.departmentId) return { error: 'No department selected.' }

  const adminClient = createAdminClient()

  const { data: current } = await adminClient
    .from('departments')
    .select('public_slug')
    .eq('id', ctx.departmentId)
    .single()

  const cleanSlug = slug?.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || null
  if (enabled && !current?.public_slug && !cleanSlug) {
    return { error: 'A URL slug is required to enable the public site.' }
  }

  const update: { public_site_enabled: boolean; public_slug?: string } = { public_site_enabled: enabled }
  if (!current?.public_slug && cleanSlug) update.public_slug = cleanSlug

  const { error: dbErr } = await adminClient
    .from('departments')
    .update(update)
    .eq('id', ctx.departmentId)

  if (dbErr) {
    if (dbErr.code === '23505') return { error: 'That slug is already in use by another department.' }
    await logError(dbErr.message, '/dept-admin/settings', { department_id: ctx.departmentId })
    return { error: dbErr.message }
  }

  revalidatePath('/dept-admin/settings')
  revalidatePath('/dept-admin')
  return { success: true, slug: update.public_slug ?? current?.public_slug ?? null }
}

export async function toggleEventSeriesPublic(eventSeriesId: string, isPublic: boolean, departmentId: string) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) return { error: 'Session expired.' }

  // Allow sys admins or department admins for this department
  if (!(await hasPermissionForDepartment(me.id, me.is_sys_admin, departmentId, 'manage_public_site'))) {
    return { error: 'Only department admins can change event visibility.' }
  }

  const { error: dbErr } = await adminClient
    .from('event_series')
    .update({ is_public: isPublic })
    .eq('id', eventSeriesId)
    .eq('department_id', departmentId)

  if (dbErr) {
    await logError(dbErr, `/events`)
    return { error: dbErr.message }
  }

  revalidatePath('/events')
  revalidatePath(`/admin/dept/${departmentId}`)
  return { success: true }
}

export async function saveDeptInboxSettings(formData: FormData) {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx || !ctx.departmentId) return { error: 'Unauthorized.' }
  if (!(await hasPermission(ctx, 'manage_public_site'))) return { error: 'Unauthorized.' }

  const department_id          = ctx.departmentId
  const burn_permit_county_info  = (formData.get('burn_permit_county_info') as string)?.trim() || null
  const burn_permit_restrictions = (formData.get('burn_permit_restrictions') as string)?.trim() || null

  const { error: dbErr } = await adminClient
    .from('departments')
    .update({ burn_permit_county_info, burn_permit_restrictions })
    .eq('id', department_id)

  if (dbErr) {
    await logError(dbErr, '/dept-admin/public-inbox')
    return { error: dbErr.message }
  }

  revalidatePath('/dept-admin/public-inbox')
  return { success: true }
}

export async function submitBurnPermit(formData: FormData) {
  const adminClient = createAdminClient()

  const department_id  = formData.get('department_id') as string
  const contact_name   = (formData.get('contact_name') as string)?.trim()
  const contact_email  = (formData.get('contact_email') as string)?.trim()
  const contact_phone  = (formData.get('contact_phone') as string)?.trim() || null
  const burn_address   = (formData.get('burn_address') as string)?.trim()
  const burn_date      = formData.get('burn_date') as string
  const burn_description = (formData.get('burn_description') as string)?.trim()

  if (!department_id || !contact_name || !contact_email || !burn_address || !burn_date || !burn_description) {
    return { error: 'Please fill in all required fields.' }
  }

  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRx.test(contact_email)) return { error: 'Please enter a valid email address.' }

  const today = new Date().toISOString().split('T')[0]
  if (burn_date < today) return { error: 'Burn date cannot be in the past.' }

  const { data, error: dbErr } = await adminClient
    .from('burn_permits')
    .insert({ department_id, contact_name, contact_email, contact_phone, burn_address, burn_date, burn_description })
    .select('confirmation_code')
    .single()

  if (dbErr) {
    await logError(dbErr, 'public/burn-permit')
    return { error: 'Something went wrong. Please try again.' }
  }

  const { data: dept } = await adminClient
    .from('departments')
    .select('name, public_slug')
    .eq('id', department_id)
    .single()

  await logEvent({
    log_type: 'user_report',
    page: '/dept/burn-permit',
    department_id,
    message: [
      `New burn permit application submitted.`,
      `Applicant: ${contact_name}`,
      `Email: ${contact_email}`,
      contact_phone ? `Phone: ${contact_phone}` : null,
      `Department: ${dept?.name ?? department_id}`,
      `Burn address: ${burn_address}`,
      `Burn date: ${burn_date}`,
      burn_description ? `Description: ${burn_description}` : null,
      `Confirmation code: ${data.confirmation_code}`,
      `Review at: https://www.fireops7.com/inbox`,
    ].filter(Boolean).join('\n'),
    metadata: {
      permit_id: data.confirmation_code,
      confirmation_code: data.confirmation_code,
      department_id,
    },
  })

  // Notify opted-in officers/admins for this department via email
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    const { data: notifyRecipients } = await adminClient
      .from('department_personnel')
      .select('personnel_id')
      .eq('department_id', department_id)
      .eq('active', true)
      .eq('burn_permit_reviewer', true)
      .in('system_role', ['admin', 'officer'])

    const recipientIds = (notifyRecipients ?? []).map((r) => r.personnel_id)

    if (recipientIds.length > 0) {
      const { data: recipientPersonnel } = await adminClient
        .from('personnel')
        .select('email')
        .in('id', recipientIds)

      const recipientEmails = (recipientPersonnel ?? [])
        .map((p) => p.email)
        .filter((e): e is string => !!e)

      if (recipientEmails.length > 0) {
        const deptName = dept?.name ?? 'FireOps7'
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <p>New burn permit application submitted for ${escapeHtml(deptName)}.</p>
            <p><strong>Applicant:</strong> ${escapeHtml(contact_name)}</p>
            <p><strong>Email:</strong> ${escapeHtml(contact_email)}</p>
            ${contact_phone ? `<p><strong>Phone:</strong> ${escapeHtml(contact_phone)}</p>` : ''}
            <p><strong>Burn address:</strong> ${escapeHtml(burn_address)}</p>
            <p><strong>Burn date:</strong> ${escapeHtml(burn_date)}</p>
            <p style="white-space:pre-line">${escapeHtml(burn_description)}</p>
            <p style="margin-top:24px"><a href="https://www.fireops7.com/inbox">Review in FireOps7 →</a></p>
          </div>
        `

        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'FireOps7 <noreply@fireops7.com>',
            to: recipientEmails,
            subject: `New burn permit application — ${deptName}`,
            html,
          }),
        })

        if (!emailRes.ok) {
          await logError(await emailRes.text(), 'public/burn-permit-notify')
        }
      }
    }
  }

  return { confirmationCode: data.confirmation_code }
}

// ─── Inbox: Update burn permit status ────────────────────────────────────────
export async function updateBurnPermitStatus(formData: FormData) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const { data: meList } = await adminClient
    .from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) return { error: 'Could not verify your account.' }

  const ctx = await getCurrentDepartmentContext()
  if (!ctx || !ctx.departmentId) return { error: 'Unauthorized.' }
  if (!(await hasPermission(ctx, 'review_burn_permits'))) return { error: 'Unauthorized.' }

  const permit_id          = formData.get('permit_id') as string
  const status             = formData.get('status') as string
  const reviewer_notes     = (formData.get('reviewer_notes') as string)?.trim() || null
  const permit_expiry_date = (formData.get('permit_expiry_date') as string) || null

  if (!['approved', 'denied', 'cancelled'].includes(status)) return { error: 'Invalid status.' }

  // Validate dept config before approving
  if (status === 'approved') {
    const { data: permitCheck } = await adminClient
      .from('burn_permits')
      .select('department_id')
      .eq('id', permit_id)
      .single()

    if (permitCheck) {
      const { data: deptCheck } = await adminClient
        .from('departments')
        .select('name, burn_permit_county_info')
        .eq('id', permitCheck.department_id)
        .single()

      if (!deptCheck?.name) {
        return { error: 'Department name is not set. Configure it in Admin → Department before approving permits.' }
      }
      if (!deptCheck?.burn_permit_county_info) {
        return { error: 'County/sheriff info is required before approving permits. Configure it in Admin → Department → Public Site tab.' }
      }
    }
  }

  const updateData: Record<string, unknown> = { status, reviewer_notes, updated_at: new Date().toISOString() }
  if (status === 'approved') {
    updateData.issued_date = new Date().toISOString().split('T')[0]
    updateData.approved_by_personnel_id = me.id
    if (permit_expiry_date) updateData.permit_expiry_date = permit_expiry_date
  }

  const { error: dbErr } = await adminClient.from('burn_permits').update(updateData).eq('id', permit_id)
  if (dbErr) { await logError(dbErr, '/inbox'); return { error: dbErr.message } }

  // Email the resident their approval directly via the send-permit-approval Edge Function
  // (fireops7.com verified in Resend 2026-06-07 — direct sends now enabled)
  if (status === 'approved') {
    const { error: emailErr } = await adminClient.functions.invoke('send-permit-approval', {
      body: { permit_id },
    })
    if (emailErr) {
      await logError(emailErr, '/inbox', { personnel_id: me.id, metadata: { permit_id, report_type: 'burn_permit_approval_email' } })
    }
  }

  revalidatePath('/inbox')
  return { success: true }
}

// ─── Permit: Email the holder directly (e.g. conditions changed, can't burn) ──
export async function contactPermitHolder(formData: FormData) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const { data: meList } = await adminClient
    .from('personnel').select('id, first_name, last_name, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) return { error: 'Could not verify your account.' }

  const permit_id = formData.get('permit_id') as string
  const subject   = (formData.get('subject') as string)?.trim()
  const message   = (formData.get('message') as string)?.trim()
  if (!permit_id || !message) return { error: 'Please enter a message.' }

  const { data: permit } = await adminClient
    .from('burn_permits')
    .select('id, department_id, contact_name, contact_email, confirmation_code')
    .eq('id', permit_id)
    .single()
  if (!permit) return { error: 'Permit not found.' }
  if (!permit.contact_email) return { error: 'This permit has no email address on file — a message cannot be sent.' }

  if (!(await hasPermissionForDepartment(me.id, me.is_sys_admin, permit.department_id, 'review_burn_permits'))) {
    return { error: 'Unauthorized.' }
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return { error: 'Email sending is not configured.' }

  const { data: dept } = await adminClient
    .from('departments').select('name, public_email').eq('id', permit.department_id).single()

  const senderName = `${me.first_name ?? ''} ${me.last_name ?? ''}`.trim()
  const deptName = dept?.name ?? 'FireOps7'
  const greeting = permit.contact_name ? `Hi ${escapeHtml(permit.contact_name)},` : 'Hi,'
  const signOffLines = senderName
    ? `${escapeHtml(senderName)}<br/>${escapeHtml(deptName)}`
    : escapeHtml(deptName)

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <p>${greeting}</p>
      <p style="white-space:pre-line">${escapeHtml(message)}</p>
      <p style="margin-top:24px">— ${signOffLines}</p>
      <p style="margin-top:24px;color:#888;font-size:12px">Regarding burn permit ${escapeHtml(permit.confirmation_code)}</p>
    </div>
  `

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${deptName} (via FireOps7) <noreply@fireops7.com>`,
      to: permit.contact_email,
      ...(dept?.public_email ? { reply_to: dept.public_email } : {}),
      subject: subject || `Regarding your burn permit (${permit.confirmation_code})`,
      html,
    }),
  })

  if (!emailRes.ok) {
    await logError(await emailRes.text(), '/inbox/permit-contact')
    return { error: 'Failed to send email. Please try again.' }
  }

  await logEvent({
    log_type: 'info',
    page: '/inbox',
    message: `Permit holder contacted: ${permit.contact_name} (${permit.confirmation_code})`,
    personnel_id: me.id,
    department_id: permit.department_id,
    metadata: { permit_id, subject: subject || null },
  })

  return { success: true }
}

// ─── Permit: Delete (password-confirmed — permits should normally persist) ────
export async function deleteBurnPermit(formData: FormData) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const { data: meList } = await adminClient
    .from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) return { error: 'Could not verify your account.' }

  const ctx = await getCurrentDepartmentContext()
  if (!ctx || !ctx.departmentId) return { error: 'Unauthorized.' }
  if (!(await hasPermission(ctx, 'review_burn_permits'))) return { error: 'Unauthorized.' }

  const permit_id = formData.get('permit_id') as string
  const password  = formData.get('password') as string

  if (!password) return { error: 'Enter your password to confirm deletion.' }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password,
  })
  if (signInError) return { error: 'Incorrect password.' }

  const { error: dbErr } = await adminClient.from('burn_permits').delete().eq('id', permit_id)
  if (dbErr) { await logError(dbErr, '/inbox'); return { error: dbErr.message } }

  revalidatePath('/inbox')
  return { success: true }
}

// ─── Permit: Save officer signature ──────────────────────────────────────────
export async function savePermitOfficerSignature(formData: FormData) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const { data: meList } = await adminClient
    .from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) return { error: 'Could not verify your account.' }

  const ctx = await getCurrentDepartmentContext()
  if (!ctx || !ctx.departmentId) return { error: 'Unauthorized.' }
  if (!(await hasPermission(ctx, 'review_burn_permits'))) return { error: 'Unauthorized.' }

  const permit_id = formData.get('permit_id') as string
  const blob = formData.get('signature') as Blob
  if (!permit_id || !blob) return { error: 'Missing required fields.' }

  const path = `permits/officer/${permit_id}.png`
  const { error: uploadErr } = await adminClient.storage
    .from('signatures')
    .upload(path, blob, { contentType: 'image/png', upsert: true })
  if (uploadErr) { await logError(uploadErr, '/inbox'); return { error: uploadErr.message } }

  const signed_at = new Date().toISOString()
  const { error: dbErr } = await adminClient
    .from('burn_permits')
    .update({ officer_signature_url: path, officer_signed_at: signed_at })
    .eq('id', permit_id)
  if (dbErr) { await logError(dbErr, '/inbox'); return { error: dbErr.message } }

  revalidatePath('/inbox')
  return { success: true, signedAt: signed_at }
}

// ─── Permit: Save applicant signature (public — validated by confirmation code) ─
export async function savePermitApplicantSignature(formData: FormData) {
  const adminClient = createAdminClient()

  const confirmation_code = (formData.get('confirmation_code') as string)?.toUpperCase().trim()
  const department_id     = formData.get('department_id') as string
  const blob              = formData.get('signature') as Blob

  if (!confirmation_code || !department_id || !blob) return { error: 'Missing required fields.' }

  const { data: permit } = await adminClient
    .from('burn_permits')
    .select('id, status, officer_signed_at')
    .eq('confirmation_code', confirmation_code)
    .eq('department_id', department_id)
    .single()

  if (!permit) return { error: 'Permit not found.' }
  if (permit.status !== 'approved') return { error: 'Permit is not approved.' }
  if (!permit.officer_signed_at) return { error: 'Officer must sign before applicant.' }

  const path = `permits/applicant/${permit.id}.png`
  const { error: uploadErr } = await adminClient.storage
    .from('signatures')
    .upload(path, blob, { contentType: 'image/png', upsert: true })
  if (uploadErr) { await logError(uploadErr, '/dept/burn-permit', { metadata: { permit_id: permit.id } }); return { error: uploadErr.message } }

  const signed_at = new Date().toISOString()
  const { error: dbErr } = await adminClient
    .from('burn_permits')
    .update({ applicant_signature_url: path, applicant_signed_at: signed_at })
    .eq('id', permit.id)
  if (dbErr) { await logError(dbErr, '/dept/burn-permit', { metadata: { permit_id: permit.id } }); return { error: dbErr.message } }

  return { success: true, signedAt: signed_at }
}

// ─── Permit: Applicant print-and-sign acknowledgement (public) ───────────────
export async function acknowledgePermitPrintAndSign(formData: FormData) {
  const adminClient = createAdminClient()

  const confirmation_code = (formData.get('confirmation_code') as string)?.toUpperCase().trim()
  const department_id     = formData.get('department_id') as string

  if (!confirmation_code || !department_id) return { error: 'Missing required fields.' }

  const { data: permit } = await adminClient
    .from('burn_permits')
    .select('id, status, officer_signed_at')
    .eq('confirmation_code', confirmation_code)
    .eq('department_id', department_id)
    .single()

  if (!permit) return { error: 'Permit not found.' }
  if (permit.status !== 'approved') return { error: 'Permit is not approved.' }

  const { error: dbErr } = await adminClient
    .from('burn_permits')
    .update({ applicant_acknowledged_at: new Date().toISOString() })
    .eq('id', permit.id)
  if (dbErr) { await logError(dbErr, '/dept/burn-permit', { metadata: { permit_id: permit.id } }); return { error: dbErr.message } }

  return { success: true }
}

// ─── Inbox: Update record request status ─────────────────────────────────────
export async function updateRecordRequestStatus(formData: FormData) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const { data: meList } = await adminClient
    .from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) return { error: 'Could not verify your account.' }

  const ctx = await getCurrentDepartmentContext()
  if (!ctx || !ctx.departmentId) return { error: 'Unauthorized.' }
  if (!(await hasPermission(ctx, 'manage_public_inbox'))) return { error: 'Unauthorized.' }

  const request_id     = formData.get('request_id') as string
  const status         = formData.get('status') as string
  const reviewer_notes = (formData.get('reviewer_notes') as string)?.trim() || null

  if (!['in_review', 'fulfilled', 'denied'].includes(status)) return { error: 'Invalid status.' }

  const { error: dbErr } = await adminClient
    .from('public_record_requests')
    .update({ status, reviewer_notes, updated_at: new Date().toISOString() })
    .eq('id', request_id)
  if (dbErr) { await logError(dbErr, '/inbox'); return { error: dbErr.message } }

  if (status === 'fulfilled' || status === 'denied') {
    const { data: req } = await adminClient
      .from('public_record_requests')
      .select('contact_name, contact_email, confirmation_code, department_id, request_type')
      .eq('id', request_id)
      .single()
    if (req) {
      await logEvent({
        log_type: 'user_report',
        page: '/inbox',
        personnel_id: me.id,
        department_id: req.department_id,
        message: [
          `Records request ${status}: ${req.contact_name}`,
          `Email: ${req.contact_email}`,
          `Request type: ${req.request_type}`,
          `Confirmation code: ${req.confirmation_code}`,
          reviewer_notes ? `Notes: ${reviewer_notes}` : null,
        ].filter(Boolean).join('\n'),
        metadata: { request_id, confirmation_code: req.confirmation_code, status },
      })
    }
  }

  revalidatePath('/inbox')
  return { success: true }
}

export async function submitPublicFeedback(formData: FormData) {
  const adminClient = createAdminClient()

  const department_id = formData.get('department_id') as string
  const feedback_type = formData.get('feedback_type') as string
  const contact_name  = (formData.get('contact_name') as string)?.trim() || null
  const contact_email = (formData.get('contact_email') as string)?.trim() || null
  const message       = (formData.get('message') as string)?.trim()
  const page_url      = (formData.get('page_url') as string)?.trim() || null

  if (!department_id || !message) {
    return { error: 'Please enter a message.' }
  }

  if (!['feedback', 'bug_report'].includes(feedback_type)) {
    return { error: 'Invalid feedback type.' }
  }

  if (contact_email) {
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRx.test(contact_email)) return { error: 'Please enter a valid email address.' }
  }

  const { data: inserted, error: dbErr } = await adminClient
    .from('public_feedback')
    .insert({ department_id, feedback_type, contact_name, contact_email, message, page_url })
    .select('id')
    .single()

  if (dbErr) {
    await logError(dbErr, 'public/feedback')
    return { error: 'Something went wrong. Please try again.' }
  }

  const { data: dept } = await adminClient
    .from('departments')
    .select('name')
    .eq('id', department_id)
    .single()

  await logEvent({
    log_type: 'user_report',
    page: '/dept/feedback',
    department_id,
    message: [
      `New ${feedback_type === 'bug_report' ? 'bug report' : 'feedback'} submitted.`,
      contact_name ? `Name: ${contact_name}` : null,
      contact_email ? `Email: ${contact_email}` : null,
      `Department: ${dept?.name ?? department_id}`,
      `Message: ${message}`,
      `Review at: https://www.fireops7.com/inbox`,
    ].filter(Boolean).join('\n'),
    metadata: { department_id, feedback_type, feedback_id: inserted?.id ?? null },
  })

  // Notify opted-in officers/admins for this department via email
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    const { data: notifyRecipients } = await adminClient
      .from('department_personnel')
      .select('personnel_id')
      .eq('department_id', department_id)
      .eq('active', true)
      .eq('notify_feedback', true)
      .in('system_role', ['admin', 'officer'])

    const recipientIds = (notifyRecipients ?? []).map((r) => r.personnel_id)

    if (recipientIds.length > 0) {
      const { data: recipientPersonnel } = await adminClient
        .from('personnel')
        .select('email')
        .in('id', recipientIds)

      const recipientEmails = (recipientPersonnel ?? [])
        .map((p) => p.email)
        .filter((e): e is string => !!e)

      if (recipientEmails.length > 0) {
        const typeLabel = feedback_type === 'bug_report' ? 'problem report' : 'feedback'
        const deptName = dept?.name ?? 'FireOps7'
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <p>New ${typeLabel} submitted for ${escapeHtml(deptName)}.</p>
            ${contact_name ? `<p><strong>From:</strong> ${escapeHtml(contact_name)}</p>` : ''}
            ${contact_email ? `<p><strong>Email:</strong> ${escapeHtml(contact_email)}</p>` : ''}
            <p style="white-space:pre-line">${escapeHtml(message)}</p>
            <p style="margin-top:24px"><a href="https://www.fireops7.com/inbox">View and reply in FireOps7 →</a></p>
          </div>
        `

        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'FireOps7 <noreply@fireops7.com>',
            to: recipientEmails,
            subject: `New ${typeLabel} — ${deptName}`,
            html,
          }),
        })

        if (!emailRes.ok) {
          await logError(await emailRes.text(), 'public/feedback-notify')
        }
      }
    }
  }

  return { success: true }
}

// ─── Inbox: Update public feedback status ────────────────────────────────────
export async function updatePublicFeedbackStatus(formData: FormData) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const { data: meList } = await adminClient
    .from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) return { error: 'Could not verify your account.' }

  const ctx = await getCurrentDepartmentContext()
  if (!ctx || !ctx.departmentId) return { error: 'Unauthorized.' }
  if (!(await hasPermission(ctx, 'manage_public_inbox'))) return { error: 'Unauthorized.' }

  const feedback_id   = formData.get('feedback_id') as string
  const status        = formData.get('status') as string
  const reviewer_notes = (formData.get('reviewer_notes') as string)?.trim() || null

  if (!['new', 'reviewed', 'resolved'].includes(status)) return { error: 'Invalid status.' }

  const { error: dbErr } = await adminClient
    .from('public_feedback')
    .update({ status, reviewer_notes, updated_at: new Date().toISOString() })
    .eq('id', feedback_id)
  if (dbErr) { await logError(dbErr, '/inbox'); return { error: dbErr.message } }

  revalidatePath('/inbox')
  return { success: true }
}

// ─── Feedback: Delete ──────────────────────────────────────────────────────────
export async function deletePublicFeedback(formData: FormData) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const { data: meList } = await adminClient
    .from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) return { error: 'Could not verify your account.' }

  const ctx = await getCurrentDepartmentContext()
  if (!ctx || !ctx.departmentId) return { error: 'Unauthorized.' }
  if (!(await hasPermission(ctx, 'manage_public_inbox'))) return { error: 'Unauthorized.' }

  const feedback_id = formData.get('feedback_id') as string

  const { error: dbErr } = await adminClient.from('public_feedback').delete().eq('id', feedback_id)
  if (dbErr) { await logError(dbErr, '/inbox'); return { error: dbErr.message } }

  revalidatePath('/inbox')
  return { success: true }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─── Inbox / Admin: Reply to a public feedback submitter via email ────────────
export async function replyToPublicFeedback(formData: FormData) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const { data: meList } = await adminClient
    .from('personnel').select('id, first_name, last_name, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) return { error: 'Could not verify your account.' }

  const feedback_id = formData.get('feedback_id') as string
  const reply_message = (formData.get('reply_message') as string)?.trim()
  if (!feedback_id || !reply_message) return { error: 'Please enter a reply message.' }

  const { data: feedback } = await adminClient
    .from('public_feedback')
    .select('id, department_id, feedback_type, contact_name, contact_email, message')
    .eq('id', feedback_id)
    .single()
  if (!feedback) return { error: 'Feedback not found.' }
  if (!feedback.contact_email) return { error: 'This submission has no email address on file — a reply cannot be sent.' }

  // Authorize: sys admin, or officer+ in the feedback's department
  if (!(await hasPermissionForDepartment(me.id, me.is_sys_admin, feedback.department_id, 'manage_public_inbox'))) {
    return { error: 'Unauthorized.' }
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return { error: 'Email sending is not configured.' }

  const { data: dept } = await adminClient
    .from('departments').select('name, public_email').eq('id', feedback.department_id).single()

  const replierName = `${me.first_name ?? ''} ${me.last_name ?? ''}`.trim()
  const deptName = dept?.name ?? 'FireOps7'
  const greeting = feedback.contact_name ? `Hi ${escapeHtml(feedback.contact_name)},` : 'Hi,'
  const subjectLabel = feedback.feedback_type === 'bug_report' ? 'problem report' : 'feedback'

  const signOffLines = replierName
    ? `${escapeHtml(replierName)}<br/>${escapeHtml(deptName)}`
    : escapeHtml(deptName)

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <p>${greeting}</p>
      <p style="white-space:pre-line">${escapeHtml(reply_message)}</p>
      <p style="margin-top:24px">— ${signOffLines}</p>
    </div>
  `

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${deptName} (via FireOps7) <noreply@fireops7.com>`,
      to: feedback.contact_email,
      ...(dept?.public_email ? { reply_to: dept.public_email } : {}),
      subject: `Re: Your ${subjectLabel} to ${deptName}`,
      html,
    }),
  })

  if (!emailRes.ok) {
    await logError(await emailRes.text(), '/inbox/feedback-reply')
    return { error: 'Failed to send reply email. Please try again.' }
  }

  const { error: dbErr } = await adminClient
    .from('public_feedback')
    .update({
      reply_message,
      replied_at: new Date().toISOString(),
      replied_by_personnel_id: me.id,
      status: 'resolved',
      updated_at: new Date().toISOString(),
    })
    .eq('id', feedback_id)
  if (dbErr) { await logError(dbErr, '/inbox'); return { error: dbErr.message } }

  revalidatePath('/inbox')
  revalidatePath('/admin/logs')
  return { success: true }
}

export async function submitRecordRequest(formData: FormData) {
  const adminClient = createAdminClient()

  const department_id    = formData.get('department_id') as string
  const contact_name     = (formData.get('contact_name') as string)?.trim()
  const contact_email    = (formData.get('contact_email') as string)?.trim()
  const contact_phone    = (formData.get('contact_phone') as string)?.trim() || null
  const request_type     = formData.get('request_type') as string
  const description      = (formData.get('description') as string)?.trim()
  const incident_date    = (formData.get('incident_date') as string) || null
  const incident_address = (formData.get('incident_address') as string)?.trim() || null

  if (!department_id || !contact_name || !contact_email || !request_type || !description) {
    return { error: 'Please fill in all required fields.' }
  }

  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRx.test(contact_email)) return { error: 'Please enter a valid email address.' }

  const validTypes = ['incident_report', 'inspection_record', 'other']
  if (!validTypes.includes(request_type)) return { error: 'Invalid request type.' }

  const { data, error: dbErr } = await adminClient
    .from('public_record_requests')
    .insert({ department_id, contact_name, contact_email, contact_phone, request_type, description, incident_date, incident_address })
    .select('confirmation_code')
    .single()

  if (dbErr) {
    await logError(dbErr, 'public/records')
    return { error: 'Something went wrong. Please try again.' }
  }

  const { data: dept } = await adminClient
    .from('departments')
    .select('name')
    .eq('id', department_id)
    .single()

  await logEvent({
    log_type: 'user_report',
    page: '/dept/records',
    department_id,
    message: [
      `New records request submitted.`,
      `Applicant: ${contact_name}`,
      `Email: ${contact_email}`,
      contact_phone ? `Phone: ${contact_phone}` : null,
      `Department: ${dept?.name ?? department_id}`,
      `Request type: ${request_type}`,
      description ? `Description: ${description}` : null,
      incident_date ? `Incident date: ${incident_date}` : null,
      incident_address ? `Incident address: ${incident_address}` : null,
      `Confirmation code: ${data.confirmation_code}`,
      `Review at: https://www.fireops7.com/inbox`,
    ].filter(Boolean).join('\n'),
    metadata: { confirmation_code: data.confirmation_code, department_id },
  })

  return { confirmationCode: data.confirmation_code }
}
