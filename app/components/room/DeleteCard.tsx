import { createContext, use, useMemo, type PropsWithChildren } from 'react';
import { useFetcher, useNavigate } from 'react-router';
import { Trash2Icon } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogClose,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogPopup,
    AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import { useDialogState } from '~/hooks';
import { hangingUnder } from '~/lib/room';
import { KIND_NAMES } from './kind-icons';
import { FocusedCardContext, useCards, useRoomLinks } from './room-context';

/** The fetcher every delete goes through (the canvas hides what's going). */
export const DELETE_FETCHER_KEY = 'delete-card';

type DeleteCard = {
    /** Asks first, in a modal; deletes on yes. */
    confirmDelete: (cardId: string) => void;
};

const DeleteCardContext = createContext<DeleteCard | null>(null);

export function useDeleteCard(): DeleteCard {
    const value = use(DeleteCardContext);
    if (!value) throw new Error('useDeleteCard needs a DeleteCardProvider');
    return value;
}

/**
 * Deleting a card: the confirm modal (naming the cards hanging under it,
 * which go too) and the `delete-card` post. Leaving a focused card that's
 * going takes you back to the canvas first.
 */
export function DeleteCardProvider({ children }: PropsWithChildren) {
    const dialog = useDialogState<string>();
    const fetcher = useFetcher({ key: DELETE_FETCHER_KEY });
    const navigate = useNavigate();
    const links = useRoomLinks();
    const focusedId = use(FocusedCardContext);
    const { cards, cardOf } = useCards();
    const { openDialog } = dialog;
    const value = useMemo(
        () => ({ confirmDelete: (cardId: string) => openDialog(cardId) }),
        [openDialog],
    );

    const card = dialog.target ? cardOf(dialog.target) : undefined;
    const hanging = card
        ? hangingUnder(card.id, cards).flatMap((id) => cardOf(id) ?? [])
        : [];

    function handleDelete() {
        if (!card) return;
        if (
            focusedId &&
            [card.id, ...hanging.map((h) => h.id)].includes(focusedId)
        ) {
            void navigate(links.action);
        }
        void fetcher.submit(
            { intent: 'delete-card', cardId: card.id },
            { method: 'post', action: links.action },
        );
        dialog.close();
    }

    return (
        <DeleteCardContext value={value}>
            {children}
            <AlertDialog open={dialog.open} onOpenChange={dialog.onOpenChange}>
                <AlertDialogPopup>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Delete {card ? `“${card.title}”` : 'this card'}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {card
                                ? `This ${KIND_NAMES[card.kind].toLowerCase()} and its links go for everyone in this room. This can't be undone.`
                                : null}
                        </AlertDialogDescription>
                        {hanging.length > 0 && (
                            <div className="text-sm">
                                <p className="text-muted-foreground">
                                    {hanging.length === 1
                                        ? 'The card hanging under it goes too:'
                                        : `The ${hanging.length} cards hanging under it go too:`}
                                </p>
                                <ul className="mt-1 list-disc ps-5">
                                    {hanging.map((card) => (
                                        <li key={card.id}>
                                            {KIND_NAMES[card.kind]}:{' '}
                                            {card.title}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogClose render={<Button variant="ghost" />}>
                            Cancel
                        </AlertDialogClose>
                        <Button variant="destructive" onClick={handleDelete}>
                            <Trash2Icon aria-hidden="true" />
                            Delete
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogPopup>
            </AlertDialog>
        </DeleteCardContext>
    );
}
