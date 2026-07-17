export function reservationExpiryDeadline(
  createdAt: Date,
  reservationMinutes: number,
): Date {
  return new Date(createdAt.getTime() + reservationMinutes * 60 * 1000);
}

export function isReservationExpired(input: {
  status: string;
  reservationExpiresAt: Date | null;
  now: Date;
}): boolean {
  return (
    input.status === "PENDING" &&
    input.reservationExpiresAt !== null &&
    input.reservationExpiresAt <= input.now
  );
}
