import { useRouteLoaderData } from 'react-router';
import { APP_NAME } from '~/config';
import type { loader as roomLoader } from './room';

/** The whole canvas, nothing focused: the parent route draws it. */
export default function RoomIndex() {
    const data = useRouteLoaderData<typeof roomLoader>('routes/room');
    const name = data?.room.name;
    return (
        <>
            <title>{name ? `${name} | ${APP_NAME}` : APP_NAME}</title>
            <meta
                name="description"
                content={
                    data?.room.description ||
                    'Every kind of company information, and how it relates.'
                }
            />
        </>
    );
}
