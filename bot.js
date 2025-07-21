const noblox = require('noblox.js');
const cron = require('node-cron');

// === CONFIGURATION === //
const ROBLOX_COOKIE = '_|WARNING:-DO-NOT-SHARE-THIS.|_CAEaAhAB.9222D9E288B3436C8F06B1AD1FE3FABC0D1D2EDD9971E4BFE580FFA437EE5C37CB20863C8042BB19CCEE0FBC2EBB3CAD7E5F838C284EDF9CBB36541EAF73E1EA80AA18D4787AB878777F8E4CD719042D0CEB8627BB09C56773071F5CB01C140FC3ED4CBE3EFF5C653CD608525E627D616A8247BC2F39A59D70323EFD7D10D363A554F5D67E885E15EB10D4CA14121314D2C9A88632D8CE628730EB54F186A937F7222475BC4EC0CB64A7C076BEF452B41E75C6658857D2141CAB8DC06B654FC336ADE4D1CA1615BE1773F6F53CFEE3A438567995CDF5B4F5EF53DEA3AC63839F6147AB1E2B4650AFAE5A4F54B26AB0D8199718865C40A527058D50CC64937BBE260CD587BDE75B01B0F370275BE8A07E38E40B5BAE2AE1212E7E555E6CDC3292675F31E798A1A290093599BB146C8EFD7D2C4387DA8E733FF960EC91FCED97A33151BC8AF04FD457F2BF492D1C61CB00C1CEDD64F3A45EB8E2878A6B2921438871A7CC658B04DBD14A4AF5C9A488F99EFDF8F990B67FC465E80476DB88DA111D5E59AF9824DFBFCDB00C48910308F563CADFA0584D7B3E8FFB191A93A7CD79FDEAF8D7ADCEB2E3A3CBCE2420BD34D089E2ADDAA9D9F5A78BAA235FAA2EA5749EA72227E411360731F448BA8580919241393C6F704938DA0CE4B321CB36F621E798FE888B588C242EA31859B29304E7C2170B503ECAF00810B6341C01955F818CC290A09B7898DE6521EFC2728DA999C3719BC0614C648ECCA4E474C9A44D77E00EBA61065F1D356FA25679EB8B08688CE93CFCAEEC602B56257AEE7E046110A58A1F875EC85D64ED1B918184284F824EEE2A16CBC1E81C99B2A1C123952C428418DBB41304440043F9A6EE86886ED946873D619EDBC2FDD08E9CA941AD66CAE15ACCFA921C83DC58950C65622E285A6F4C716A3C7CCA8B395F8ADCCD06EB2C49A6479FF23BF50C635B23AD677DF3F78620DA0DEC26DFFCF86E18E83653950B4FE7302F48C7C534045D88A0EAC698307EA41ED00CBF5DA21D9CB96B673CA80147232BDAB506A21CAC97219EB0993901A865D8089B7BFA1D483B161FC203ABF8894E71BC38483CC1440CC2AB9452FD4C0A0278A0108C8339DBC2A08879DCC99133687A71BC8AFE9B85EB86CE419840C9078D34FD7AAEB27EAA88E8F205535A06F74DEE26952DE51CDDBF91DAC2DD8143475BFD16E1';
const GROUP_ID = 13145002; // Replace with your group ID
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
