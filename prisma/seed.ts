import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const adminEmail = 'admin@hardware.com';
    const adminPassword = await bcrypt.hash('Admin@2026!', 10);

    // upsert means: If this email exists, do nothing. If not, create it.
    const admin = await prisma.user.upsert({
        where: { email: adminEmail },
        update: {},
        create: {
            email: adminEmail,
            name: 'Super Admin',
            password: adminPassword,
            role: 'ADMIN',
        },
    });

    console.log(`✅ Genesis Admin created: ${admin.email}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });