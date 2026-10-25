import type { Offer } from './engine';

export type TransferOffer = Omit<Offer, 'schedule'> & {
  readonly schedule: {
    readonly startsAtMs: number | null;
    readonly endsAtMs: number | null;
    readonly timezone: 'Africa/Cairo';
  };
};

export function toTransferOffer(offer: Offer): TransferOffer {
  const { schedule, ...rest } = offer;
  return {
    ...rest,
    schedule: {
      startsAtMs: schedule.startsAt?.getTime() ?? null,
      endsAtMs: schedule.endsAt?.getTime() ?? null,
      timezone: schedule.timezone,
    },
  };
}

export function fromTransferOffer(transfer: TransferOffer): Offer {
  const { schedule, ...rest } = transfer;
  return {
    ...rest,
    schedule: {
      startsAt: schedule.startsAtMs === null ? null : new Date(schedule.startsAtMs),
      endsAt: schedule.endsAtMs === null ? null : new Date(schedule.endsAtMs),
      timezone: schedule.timezone,
    },
  };
}
