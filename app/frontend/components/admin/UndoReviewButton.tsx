import { router } from '@inertiajs/react'
import { Button } from '@/components/admin/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/admin/ui/alert-dialog'
import { RotateCcwIcon } from 'lucide-react'

interface Props {
  reviewId: number
  reviewType: string
}

export function UndoReviewButton({ reviewId, reviewType }: Props) {
  function handleUndo() {
    router.post(
      '/admin/reviews/undos',
      { review_type: reviewType, review_id: reviewId },
      { preserveScroll: true },
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <RotateCcwIcon className="size-3.5" />
          Undo
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Undo this review?</AlertDialogTitle>
          <AlertDialogDescription>
            This will reset the review to pending so it re-enters the queue. Only possible within 1 hour of completion.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleUndo}>Undo review</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
