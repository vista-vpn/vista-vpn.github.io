const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const axios = require('axios');

// Верификация данных от Telegram
async function verifyTelegramData(initData) {
    if (!initData) return false;

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const secret = crypto.createHmac('sha256', 'WebAppData')
        .update(BOT_TOKEN)
        .digest();

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    const dataCheckString = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');

    const computedHash = crypto.createHmac('sha256', secret)
        .update(dataCheckString)
        .digest('hex');

    return hash === computedHash;
}

// Аутентификация и получение/создание пользователя
router.post('/login', async (req, res) => {
    try {
        const { initData, user: userData } = req.body;

        // В production раскомментировать проверку
        // const isValid = await verifyTelegramData(initData);
        // if (!isValid) {
        //     return res.status(401).json({ error: 'Invalid data' });
        // }

        const db = getDb();

        // Проверяем существование пользователя
        let user = await db.get(
            'SELECT * FROM users WHERE telegram_id = ?',
            userData.id
        );

        if (!user) {
            // Создаем нового пользователя
            const result = await db.run(
                `INSERT INTO users (telegram_id, first_name, last_name, username, photo_url, language_code) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                userData.id,
                userData.first_name,
                userData.last_name || null,
                userData.username || null,
                userData.photo_url || null,
                userData.language_code || 'ru'
            );

            const userId = result.lastID;

            // Создаем статистику
            await db.run(
                'INSERT INTO user_stats (user_id) VALUES (?)',
                userId
            );

            user = await db.get('SELECT * FROM users WHERE id = ?', userId);
        }

        // Получаем статистику
        const stats = await db.get(
            'SELECT * FROM user_stats WHERE user_id = ?',
            user.id
        );

        // Получаем активную подписку
        const subscription = await db.get(
            `SELECT * FROM subscriptions 
             WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now') 
             ORDER BY expires_at DESC LIMIT 1`,
            user.id
        );

        // Получаем количество рефералов
        const referralCount = await db.get(
            'SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ?',
            user.id
        );

        res.json({
            success: true,
            user: {
                id: user.id,
                telegram_id: user.telegram_id,
                first_name: user.first_name,
                last_name: user.last_name,
                username: user.username,
                photo_url: user.photo_url
            },
            stats: {
                balance: stats?.balance || 0,
                total_referrals: referralCount?.count || 0,
                total_earned: stats?.total_earned || 0
            },
            subscription: subscription || null
        });

    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;