import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import { eventBus, Events } from "../utils/eventBus.js";
import { notifyContact, dispatchChannelStatus } from "./notificationService.js";

export async function triggerSos({ user, latitude, longitude, message, journeyId, isSilent = false }) {
  const event = await prisma.emergencyEvent.create({
    data: { userId: user.id, latitude, longitude, message, journeyId, isSilent, status: "TRIGGERED" },
  });

  if (journeyId) {
    await prisma.journey.update({ where: { id: journeyId }, data: { status: "SOS_TRIGGERED" } }).catch(() => {});
  }

  const contacts = await prisma.emergencyContact.findMany({ where: { userId: user.id } });

  // Real dispatch: SMS + email to every saved contact, in parallel. Each
  // contact's result (sent / simulated / queued_for_retry) is recorded on
  // the event so the caller — and the admin dashboard — can see exactly
  // what happened, rather than assuming success.
  const notificationResults = (
    await Promise.all(
      contacts.map((contact) =>
        notifyContact(contact, { userName: user.name, latitude, longitude, message }).catch((err) => {
          logger.error({ err, contactId: contact.id }, "[emergencyService] notifyContact threw unexpectedly");
          return [{ channel: "unknown", to: contact.id, status: "failed" }];
        }),
      ),
    )
  ).flat();

  const updatedEvent = await prisma.emergencyEvent.update({
    where: { id: event.id },
    data: { notificationResults },
  });

  // A silent trigger still reaches admins with full urgency — the only
  // difference is what the triggering user's own screen shows them.
  eventBus.emit(Events.SOS_TRIGGERED, { user, event: updatedEvent, contacts, isSilent });

  return {
    event: updatedEvent,
    contactsNotified: contacts.length,
    notificationResults,
    channels: dispatchChannelStatus(),
  };
}

export async function listContacts(userId) {
  return prisma.emergencyContact.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

export async function addContact({ userId, name, phone, email, relationship }) {
  return prisma.emergencyContact.create({ data: { userId, name, phone, email, relationship } });
}

export async function removeContact({ userId, contactId }) {
  const contact = await prisma.emergencyContact.findUnique({ where: { id: contactId } });
  if (!contact || contact.userId !== userId) return false;
  await prisma.emergencyContact.delete({ where: { id: contactId } });
  return true;
}

export async function resolveEvent({ id, moderatorId }) {
  const event = await prisma.emergencyEvent.update({
    where: { id },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: { actorId: moderatorId, action: "emergency.resolved", targetType: "EmergencyEvent", targetId: id },
  });
  return event;
}
