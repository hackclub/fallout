import type { RefObject } from 'react'
import Axios from 'axios'
import { notify } from '@/lib/notifications'

type ModalValidationErrors = Record<string, string[]>

type ModalLike = {
  close?: () => void
} | null

type ModalMutationOptions = {
  url: string
  method: 'delete' | 'patch' | 'post'
  data?: unknown
  modal?: ModalLike
  modalRef?: RefObject<{ close: () => void } | null>
  successMessage: string
  errorMessage: string
  successEvent?: string
  onModalEvent?: (event: string, ...args: any[]) => void
  onValidationError?: (errors: ModalValidationErrors) => void
  onFinish?: () => void
}

function modalHeaders() {
  const requestId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'manual-project-modal-request'

  return {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'X-CSRF-Token': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '',
    'X-InertiaUI-Modal': requestId,
    'X-InertiaUI-Modal-Use-Router': 0,
  }
}

export async function performModalMutation({
  url,
  method,
  data,
  modal,
  modalRef,
  successMessage,
  errorMessage,
  successEvent,
  onModalEvent,
  onValidationError,
  onFinish,
}: ModalMutationOptions): Promise<boolean> {
  try {
    await Axios({
      url,
      method,
      data,
      headers: modalHeaders(),
    })

    notify('notice', successMessage)
    if (successEvent) onModalEvent?.(successEvent)
    modal?.close?.()
    modalRef?.current?.close()
    return true
  } catch (error) {
    if (Axios.isAxiosError(error)) {
      const errors = error.response?.data?.errors
      if (error.response?.status === 422 && errors && onValidationError) {
        onValidationError(errors)
        return false
      }
    }

    notify('alert', errorMessage)
    return false
  } finally {
    onFinish?.()
  }
}
