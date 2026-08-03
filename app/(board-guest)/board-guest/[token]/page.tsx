import BoardGuestClient from './BoardGuestClient'

export default async function BoardGuestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <BoardGuestClient token={token} />
}
