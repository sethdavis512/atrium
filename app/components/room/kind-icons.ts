import {
    ChartColumnIcon,
    FileTextIcon,
    GlobeIcon,
    GitPullRequestIcon,
    ImageIcon,
    KanbanSquareIcon,
    MessageCircleIcon,
    SquarePlayIcon,
    StickyNoteIcon,
    PaletteIcon,
    LayoutDashboardIcon,
    type LucideIcon,
} from 'lucide-react';
import type { CardKind } from '~/lib/room';

/** One icon per kind of card, wherever cards are listed or linked. */
export const KIND_ICONS: Record<CardKind, LucideIcon> = {
    chat: MessageCircleIcon,
    document: FileTextIcon,
    'pull-request': GitPullRequestIcon,
    chart: ChartColumnIcon,
    board: KanbanSquareIcon,
    video: SquarePlayIcon,
    web: GlobeIcon,
    image: ImageIcon,
    note: StickyNoteIcon,
    sketch: PaletteIcon,
    ui: LayoutDashboardIcon,
};

export const KIND_NAMES: Record<CardKind, string> = {
    chat: 'Chat',
    document: 'Document',
    'pull-request': 'Pull request',
    chart: 'Chart',
    board: 'Board',
    video: 'Video',
    web: 'Web page',
    image: 'Image',
    note: 'Sticky note',
    sketch: 'Sketch',
    ui: 'UI',
};
