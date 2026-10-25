/**
 * PRAHARI demo seed data
 * ======================
 * IMPORTANT: This is clearly-labeled DEMO data for showcasing the platform.
 * It is NOT real crime statistics and must never be presented as such.
 * Coordinates are real Bengaluru locations; incident content is invented
 * for demonstration purposes only.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const DEMO_USERS = [
  { clerkUserId: "seed_admin", email: "admin@prahari.demo", name: "Priya (Admin)", role: "ADMIN" },
  { clerkUserId: "seed_mod", email: "moderator@prahari.demo", name: "Arjun (Moderator)", role: "MODERATOR" },
  { clerkUserId: "seed_user_1", email: "ananya@prahari.demo", name: "Ananya" },
  { clerkUserId: "seed_user_2", email: "meera@prahari.demo", name: "Meera" },
  { clerkUserId: "seed_user_3", email: "rahul@prahari.demo", name: "Rahul" },
];

const GROUPS = [
  { name: "Bengaluru Safety", description: "General safety discussion for Bengaluru residents and commuters." },
  { name: "Women Travelling Alone", description: "Tips, experiences, and support for women navigating the city solo." },
  { name: "College Students", description: "Campus-area safety, hostel routes, and late-study-night tips." },
  { name: "Night Shift Workers", description: "For those commuting during odd hours — cab safety, well-lit routes, check-in buddies." },
  { name: "Public Transport Safety", description: "Bus, metro, and auto-rickshaw safety experiences." },
];

// [DEMO DATA] Real Bengaluru coordinates, invented incident narratives.
const INCIDENTS = [
  { type: "POOR_LIGHTING", description: "[Demo] Stretch near 80 Feet Road has several non-functional streetlights after 9pm.", latitude: 12.9352, longitude: 77.6245, severity: "MEDIUM" },
  { type: "HARASSMENT", description: "[Demo] Reported catcalling incident near a bus stop on Sarjapur Road.", latitude: 12.9010, longitude: 77.6870, severity: "HIGH" },
  { type: "SUSPICIOUS_ACTIVITY", description: "[Demo] Unusual loitering reported near a residential lane in Indiranagar late at night.", latitude: 12.9719, longitude: 77.6412, severity: "MEDIUM" },
  { type: "THEFT", description: "[Demo] Phone snatching reported near a signal on Old Airport Road.", latitude: 12.9611, longitude: 77.6473, severity: "HIGH" },
  { type: "UNSAFE_AREA", description: "[Demo] Isolated underpass near Silk Board flagged as feeling unsafe after dark.", latitude: 12.9166, longitude: 77.6228, severity: "MEDIUM" },
  { type: "ACCIDENT", description: "[Demo] Minor two-wheeler accident reported at a poorly marked junction.", latitude: 12.9915, longitude: 77.5707, severity: "LOW" },
];

async function main() {
  console.log("Seeding PRAHARI demo data (clearly labeled [DEMO])...");

  const users = {};
  for (const u of DEMO_USERS) {
    users[u.clerkUserId] = await prisma.user.upsert({
      where: { clerkUserId: u.clerkUserId },
      update: {},
      create: u,
    });
  }

  const admin = users["seed_admin"];
  const allUserIds = Object.values(users).map((u) => u.id);

  const groups = {};
  for (const g of GROUPS) {
    groups[g.name] = await prisma.discussionGroup.upsert({
      where: { name: g.name },
      update: {},
      create: { ...g, createdBy: admin.id },
    });
    for (const uid of allUserIds) {
      await prisma.discussionMember.upsert({
        where: { groupId_userId: { groupId: groups[g.name].id, userId: uid } },
        update: {},
        create: { groupId: groups[g.name].id, userId: uid },
      });
    }
  }

  const seedPosts = [
    { group: "Women Travelling Alone", user: "seed_user_1", content: "[Demo] Does anyone have tips for late-night cab pickups near Koramangala 5th block? Looking for well-lit pickup points.", category: "GENERAL_SAFETY" },
    { group: "Bengaluru Safety", user: "seed_user_2", content: "[Demo] The stretch near HSR BDA complex has better lighting now after recent civic work — noticed this week.", category: "LIGHTING" },
    { group: "Night Shift Workers", user: "seed_user_3", content: "[Demo] Anyone else doing the Whitefield night shift commute? Would love a check-in buddy group.", category: "GENERAL_SAFETY" },
  ];

  for (const p of seedPosts) {
    const post = await prisma.discussionPost.create({
      data: {
        groupId: groups[p.group].id,
        userId: users[p.user].id,
        content: p.content,
        category: p.category,
      },
    });
    await prisma.discussionReply.create({
      data: {
        postId: post.id,
        userId: admin.id,
        content: "[Demo reply] Thanks for sharing — flagging this to the community safety notes.",
      },
    });
  }

  for (const inc of INCIDENTS) {
    await prisma.incident.create({
      data: {
        ...inc,
        userId: users["seed_user_1"].id,
        status: "PENDING",
        confidenceWeight: 0.3,
      },
    });
  }

  // [DEMO] Emergency contacts so the SOS flow is demoable out of the box.
  // Phone/email are invented — replace with your own for a real test of
  // the Twilio/SMTP dispatch (see backend/.env.example).
  await prisma.emergencyContact.upsert({
    where: { id: "seed_contact_1" },
    update: {},
    create: {
      id: "seed_contact_1",
      userId: users["seed_user_1"].id,
      name: "[Demo] Mom",
      phone: "+911234500000",
      email: "demo.contact1@prahari.demo",
      relationship: "Parent",
    },
  });
  await prisma.emergencyContact.upsert({
    where: { id: "seed_contact_2" },
    update: {},
    create: {
      id: "seed_contact_2",
      userId: users["seed_user_1"].id,
      name: "[Demo] Roommate",
      phone: "+911234500001",
      email: "demo.contact2@prahari.demo",
      relationship: "Roommate",
    },
  });

  console.log("Seed complete:", {
    users: Object.keys(users).length,
    groups: Object.keys(groups).length,
    posts: seedPosts.length,
    incidents: INCIDENTS.length,
    emergencyContacts: 2,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
