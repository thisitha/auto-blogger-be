import { Controller, Sse, Param, MessageEvent } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, fromEvent, map, filter } from 'rxjs';

@Controller('pipeline')
export class PipelineController {
    constructor(private eventEmitter: EventEmitter2) { }

    @Sse('stream/:topic')
    streamProgress(@Param('topic') topic: string): Observable<MessageEvent> {
        console.log(`[SSE] Client connecting for topic: "${topic}"`);

        const connectedEvent: MessageEvent = {
            data: {
                message: 'Successfully connected to pipeline stream.',
                stage: 'System',
                timestamp: new Date().toISOString(),
            },
        } as MessageEvent;

        const rawEvents = fromEvent(this.eventEmitter, 'pipeline.log');
        rawEvents.subscribe((event: any) => {
            console.log(`[SSE] Received raw event for topic: "${event.topic}" (Expected: "${topic}")`);
        });

        const events = rawEvents.pipe(
            filter((event: any) => {
                // Case insensitive matching to be safe
                const match = event.topic?.toLowerCase().trim() === topic?.toLowerCase().trim();
                if (match) console.log(`[SSE] Matched event for: "${topic}"`);
                return match;
            }),
            map((event: any) => ({
                data: {
                    message: event.message,
                    stage: event.stage,
                    timestamp: new Date().toISOString(),
                },
            } as MessageEvent)),
        );

        // We use an observable that starts with a connection message
        return new Observable<MessageEvent>(subscriber => {
            subscriber.next(connectedEvent);
            const subscription = events.subscribe(subscriber);
            return () => subscription.unsubscribe();
        });
    }
}
