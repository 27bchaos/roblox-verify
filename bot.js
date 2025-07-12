const noblox = require('noblox.js');
const cron = require('node-cron');

// === CONFIGURATION === //
const ROBLOX_COOKIE = '_|WARNING:-DO-NOT-SHARE-THIS.|_your_cookie_here';
const GROUP_ID = 1234567; // Replace with your group ID
const VERIFIED_RANK = 255; // Replace with the ID of your "Verified" role
const CHECK_INTERVAL_MINUTES = 5; // How often to check (in minutes)
// ===================== //

let pendingVerifications = {}; // Format: { userId: { username, joinedAt } }

async function start() {
    try {
        await noblox.setCookie(ROBLOX_COOKIE);
        const currentUser = await noblox.getCurrentUser();
        console.log(`🤖 Logged in as ${currentUser.UserName}`);

        // Start immediately
        await checkNewMembers();
        await checkWall();
        await handleTimeouts();

        // Then check every N minutes
        cron.schedule(`*/${CHECK_INTERVAL_MINUTES} * * * *`, async () => {
            await checkNewMembers();
            await checkWall();
            await handleTimeouts();
        });
    } catch (err) {
        console.error('❌ Failed to start bot:', err.message);
    }
}

async function checkNewMembers() {
    const allRoles = await noblox.getPlayers(GROUP_ID, 'AllRoles');

    for (const role of allRoles) {
        for (const member of role.members) {
            const { userId, username } = member;

            // Only track new users
            if (!pendingVerifications[userId]) {
                console.log(`👤 New user: ${username}`);

                pendingVerifications[userId] = {
                    username,
                    joinedAt: Date.now()
                };

                try {
                    await noblox.postOnGroupWall(
                        GROUP_ID,
                        `Welcome ${username} to this community! Verification is enabled. Please type "verify" on this wall within 24 hours to complete verification.`
                    );
                } catch (err) {
                    console.warn(`⚠️ Failed to post welcome for ${username}: ${err.message}`);
                }
            }
        }
    }
}

async function checkWall() {
    try {
        const wallPosts = await noblox.getWall(GROUP_ID, 100);

        for (const post of wallPosts) {
            const message = post.body.toLowerCase();
            const userId = post.poster.userId;

            if (message.includes("verify") && pendingVerifications[userId]) {
                const username = post.poster.username;

                try {
                    await noblox.setRank(GROUP_ID, userId, VERIFIED_RANK);
                    console.log(`✅ Verified ${username}`);
                    delete pendingVerifications[userId];
                } catch (err) {
                    console.error(`❌ Failed to verify ${username}: ${err.message}`);
                }
            }
        }
    } catch (err) {
        console.error(`❌ Error reading group wall: ${err.message}`);
    }
}

async function handleTimeouts() {
    const now = Date.now();

    for (const userId in pendingVerifications) {
        const { username, joinedAt } = pendingVerifications[userId];
        if (now - joinedAt > 24 * 60 * 60 * 1000) {
            try {
                await noblox.exile(GROUP_ID, parseInt(userId));
                await noblox.postOnGroupWall(GROUP_ID, `${username} has been kicked for failing to complete the verification process.`);
                delete pendingVerifications[userId];
                console.log(`⏱️ Kicked ${username} for not verifying`);
            } catch (err) {
                console.error(`❌ Could not kick ${username}: ${err.message}`);
            }
        }
    }
}

start();
