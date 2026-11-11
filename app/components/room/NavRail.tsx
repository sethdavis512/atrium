import { Fragment } from 'react';
import { NavLink } from 'react-router';
import {
    BookmarkIcon,
    PanelLeftOpenIcon,
    SearchIcon,
    type LucideIcon,
} from 'lucide-react';
import { cx } from 'cva.config';
import type { NavSectionKey } from '~/lib/nav-order';
import { isAgentMade, type Room } from '~/lib/room';
import { KIND_ICONS, KIND_NAMES } from './kind-icons';
import { useNavRail } from './ResizableNav';
import { useRoomLinks } from './room-context';
import { RoomSwitcher } from './RoomSwitcher';

type Props = {
    room: Room;
    navOrder: NavSectionKey[];
    onSearch: () => void;
};

type RailSection = {
    key: NavSectionKey;
    links: {
        id: string;
        to: string;
        label: string;
        icon: LucideIcon;
        agent: boolean;
    }[];
};

function railItemClassName({ isActive }: { isActive: boolean }) {
    return cx(
        'focus-visible:ring-ring relative flex size-9 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2',
        isActive
            ? 'bg-accent text-foreground'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
    );
}

/**
 * The nav collapsed to icons: expand, switch room, search, then each
 * saved view and card as an icon (its name on hover), in the nav's section
 * order. Agent-made cards carry a dot.
 */
export function NavRail({ room, navOrder, onSearch }: Props) {
    const { toggle } = useNavRail();
    const links = useRoomLinks();
    const sections = navOrder.flatMap((key): RailSection[] => {
        if (key === 'recent') return [];
        if (key === 'views') {
            return room.views.length > 0
                ? [
                      {
                          key,
                          links: room.views.map((view) => ({
                              id: view.id,
                              to: links.view(view.id),
                              label: `View: ${view.name}`,
                              icon: BookmarkIcon,
                              agent: false,
                          })),
                      },
                  ]
                : [];
        }
        const cards = room.cards.filter((card) => card.kind === key);
        return cards.length > 0
            ? [
                  {
                      key,
                      links: cards.map((card) => ({
                          id: card.id,
                          to: links.card(card.id),
                          label: `${KIND_NAMES[card.kind]}: ${card.title}`,
                          icon: KIND_ICONS[card.kind],
                          agent: isAgentMade(card),
                      })),
                  },
              ]
            : [];
    });

    return (
        <nav
            aria-label="Floor plan"
            className="flex min-h-0 flex-1 scrollbar-none flex-col items-center gap-1 overflow-y-auto py-3"
        >
            <button
                type="button"
                onClick={toggle}
                aria-label="Expand floor plan"
                title="Expand floor plan"
                className={railItemClassName({ isActive: false })}
            >
                <PanelLeftOpenIcon aria-hidden="true" className="size-4" />
            </button>
            <RoomSwitcher
                roomId={room.id}
                name={room.name}
                space={room.space}
                workspace={room.workspace}
                compact
            />
            <button
                type="button"
                onClick={onSearch}
                aria-label="Directory"
                title="Directory (⌘K)"
                className={railItemClassName({ isActive: false })}
            >
                <SearchIcon aria-hidden="true" className="size-4" />
            </button>
            {sections.map((section) => (
                <Fragment key={section.key}>
                    <span
                        aria-hidden="true"
                        className="bg-border my-1 h-px w-6"
                    />
                    {section.links.map(
                        ({ id, to, label, icon: Icon, agent }) => (
                            <NavLink
                                key={id}
                                to={to}
                                prefetch="intent"
                                aria-label={label}
                                title={label}
                                className={railItemClassName}
                            >
                                <Icon aria-hidden="true" className="size-4" />
                                {agent && (
                                    <span
                                        aria-hidden="true"
                                        className="bg-agent absolute top-1.5 right-1.5 size-1.5 rounded-full"
                                    />
                                )}
                            </NavLink>
                        ),
                    )}
                </Fragment>
            ))}
        </nav>
    );
}
