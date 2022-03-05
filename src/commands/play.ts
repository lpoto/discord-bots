import {
    AudioPlayer,
    AudioPlayerStatus,
    createAudioPlayer,
    VoiceConnection,
} from '@discordjs/voice';
import { ButtonInteraction } from 'discord.js';
import { MusicClient } from '../client';
import { Queue, Song } from '../entities';
import { AbstractCommand } from '../models';

export class Play extends AbstractCommand {
    constructor(client: MusicClient, guildId: string) {
        super(client, guildId);
    }

    get description(): string | null {
        return this.translate(['music', 'commands', 'play', 'description']);
    }

    private async next(
        interaction?: ButtonInteraction,
        replay?: boolean,
        error?: boolean,
    ): Promise<void> {
        if (!this.client.user) return;
        const queue: Queue | undefined = await Queue.findOne({
            clientId: this.client.user.id,
            guildId: this.guildId,
        });
        if (!queue) return;

        if (error || (!replay && !queue.options.includes('loop'))) {
            try {
                const song: Song | undefined = queue.songs.shift();
                if (song) {
                    if (!error && queue.options.includes('loopQueue')) {
                        let max: number =
                            Math.max.apply(
                                null,
                                queue.songs.map((s) => s.position),
                            ) + 1;
                        if (max < 0) max = 0;
                        song.position = max;
                        await song.save();
                    } else {
                        await song.remove();
                    }
                }
                if (interaction)
                    this.client.musicActions.updateQueueMessageWithInteraction(
                        interaction,
                        queue,
                        false,
                        false,
                        true,
                    );
                else
                    this.client.musicActions.updateQueueMessage(
                        queue,
                        true,
                        false,
                        true,
                    );
            } catch (e) {
                console.error('Error when playing next song: ', e);
            } finally {
                await queue.reload();
            }
        }

        queue.color = Math.floor(Math.random() * 16777215);
        await queue.save();

        this.execute(interaction);
    }

    public async execute(interaction?: ButtonInteraction): Promise<void> {
        if (!this.client.user) return;

        const connection: VoiceConnection | null =
            this.client.getVoiceConnection(this.guildId);
        if (!connection) return;

        const queue: Queue | undefined = await Queue.findOne({
            clientId: this.client.user.id,
            guildId: this.guildId,
        });

        if (!queue || queue.songs.length < 1) return;

        const song: Song = queue.songs[0];

        let audioPlayer: AudioPlayer | null = this.client.getAudioPlayer(
            queue.guildId,
        );
        if (!audioPlayer) audioPlayer = createAudioPlayer();

        if (
            audioPlayer.state.status === AudioPlayerStatus.Playing ||
            audioPlayer.state.status === AudioPlayerStatus.Paused
        )
            return;

        this.client.setAudioPlayer(queue.guildId, audioPlayer);
        connection.removeAllListeners();
        connection.subscribe(audioPlayer);

        song.getResource()
            .then((resource) => {
                if (!resource || !audioPlayer) return;
                this.client.musicActions.updateQueueMessage(queue);
                audioPlayer.play(resource);
                audioPlayer
                    .on(AudioPlayerStatus.Idle, () => {
                        audioPlayer?.removeAllListeners();
                        audioPlayer?.stop();
                        this.next(interaction);
                    })
                    .on('error', (e) => {
                        audioPlayer?.removeAllListeners();
                        audioPlayer?.stop();
                        this.getQueue().then((q) => {
                            if (!q || q.songs.length === 0) return;
                            const url: string = q.songs[0].url;
                            q.songs = q.songs.filter((s) => s.url !== url);
                            q.save().then(() => {
                                this.next(interaction);
                            });
                        });
                        console.log('Error when playing: ', e.message);
                        this.next(interaction, false, true);
                    })
                    .on('unsubscribe', () => {
                        audioPlayer?.removeAllListeners();
                        console.log('Unsubscribed audio player');
                    })
                    .on('debug', (message) => {
                        if (message === 'replay' || message === 'skip') {
                            audioPlayer?.removeAllListeners();
                            audioPlayer?.stop();
                            this.client.setAudioPlayer(queue.guildId, null);
                            this.next(interaction, message === 'replay');
                        }
                    });
            })
            .catch((e) => {
                this.client.handleError(e, 'play.ts -> creating audio player');
                this.client.setAudioPlayer(queue.guildId, null);
                return;
            });
    }
}
