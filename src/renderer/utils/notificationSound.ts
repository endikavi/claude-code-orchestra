import type { NotificationType } from '@shared/types';

// Sound type mapping from notification types
type SoundType = 'default' | 'error' | 'permission' | 'complete';

// Map notification types to sound types
const NOTIFICATION_TYPE_TO_SOUND: Record<NotificationType, SoundType> = {
  permission_request: 'permission',
  task_completed: 'complete',
  task_error: 'error',
  tool_blocked: 'error',
  instance_started: 'default',
  instance_stopped: 'default',
  context_ready: 'default',
  collaboration_alert: 'permission',
  system: 'default',
  custom: 'default',
};

// Sound configurations for Web Audio API generated tones
interface ToneConfig {
  frequencies: number[]; // Hz
  durations: number[]; // seconds
  type: OscillatorType;
  fadeOut: boolean;
}

const SOUND_CONFIGS: Record<SoundType, ToneConfig> = {
  // Pleasant notification chime - two ascending notes
  default: {
    frequencies: [523.25, 659.25], // C5, E5
    durations: [0.1, 0.15],
    type: 'sine',
    fadeOut: true,
  },
  // Error sound - descending, slightly harsh
  error: {
    frequencies: [440, 349.23], // A4, F4
    durations: [0.15, 0.2],
    type: 'triangle',
    fadeOut: true,
  },
  // Permission/attention - three-note pattern
  permission: {
    frequencies: [587.33, 659.25, 783.99], // D5, E5, G5
    durations: [0.08, 0.08, 0.15],
    type: 'sine',
    fadeOut: true,
  },
  // Complete/success - pleasant major chord arpeggio
  complete: {
    frequencies: [523.25, 659.25, 783.99], // C5, E5, G5 (C major)
    durations: [0.1, 0.1, 0.2],
    type: 'sine',
    fadeOut: true,
  },
};

// Singleton AudioContext
let audioContext: AudioContext | null = null;

/**
 * Get or create the AudioContext
 */
function getAudioContext(): AudioContext | null {
  if (!audioContext && typeof AudioContext !== 'undefined') {
    try {
      audioContext = new AudioContext();
    } catch (error) {
      console.warn('[NotificationSound] Failed to create AudioContext:', error);
      return null;
    }
  }
  return audioContext;
}

/**
 * Resume the AudioContext if it's suspended (required for autoplay policy)
 */
async function ensureAudioContextResumed(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;

  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (error) {
      console.warn('[NotificationSound] Failed to resume AudioContext:', error);
      return false;
    }
  }
  return true;
}

/**
 * Play a tone sequence using Web Audio API
 */
async function playToneSequence(config: ToneConfig, volume: number): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (!(await ensureAudioContextResumed())) return;

  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.value = Math.max(0, Math.min(1, volume / 100));

  let startTime = ctx.currentTime;

  for (let i = 0; i < config.frequencies.length; i++) {
    const freq = config.frequencies[i];
    const duration = config.durations[i];

    const oscillator = ctx.createOscillator();
    const noteGain = ctx.createGain();

    oscillator.type = config.type;
    oscillator.frequency.value = freq;

    oscillator.connect(noteGain);
    noteGain.connect(masterGain);

    // Set initial gain
    noteGain.gain.setValueAtTime(0.3, startTime);

    // Fade out at the end of the note
    if (config.fadeOut) {
      noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    }

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);

    startTime += duration * 0.9; // Slight overlap for smoother sound
  }
}

/**
 * Get the sound type for a notification type
 */
export function getSoundTypeForNotification(notificationType: NotificationType): SoundType {
  return NOTIFICATION_TYPE_TO_SOUND[notificationType] || 'default';
}

/**
 * Play notification sound for a given notification type
 * @param notificationType - The type of notification
 * @param volume - Volume level from 0 to 100
 */
export function playNotificationSound(
  notificationType: NotificationType,
  volume: number = 50
): void {
  const soundType = getSoundTypeForNotification(notificationType);
  playSound(soundType, volume);
}

/**
 * Play a specific sound type
 * @param soundType - The sound type to play
 * @param volume - Volume level from 0 to 100
 */
export function playSound(soundType: SoundType, volume: number = 50): void {
  const config = SOUND_CONFIGS[soundType];
  if (!config) {
    console.warn(`[NotificationSound] Unknown sound type: ${soundType}`);
    return;
  }

  playToneSequence(config, volume).catch((error) => {
    console.warn('[NotificationSound] Failed to play sound:', error);
  });
}

/**
 * Initialize the audio system (should be called on user interaction)
 */
export async function initializeAudio(): Promise<boolean> {
  return ensureAudioContextResumed();
}

/**
 * Test a specific sound (for settings preview)
 * @param soundType - The sound type to test
 * @param volume - Volume level from 0 to 100
 */
export function testSound(soundType: SoundType, volume: number = 50): void {
  playSound(soundType, volume);
}

/**
 * Cleanup the audio context
 */
export function cleanupAudio(): void {
  if (audioContext) {
    audioContext.close().catch(console.warn);
    audioContext = null;
  }
}

export type { SoundType };
