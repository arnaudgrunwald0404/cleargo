import { redirect } from 'next/navigation';

export default function CommentsRedirect() {
    redirect('/releases/comments');
}
