const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// Получение реферальной ссылки
router.get('/link/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const botUsername = process.env.BOT_USERNAME;

        const db = getDb();
        const user = await db.get('SELECT * FROM users WHERE id = ?', userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const referralLink = `https://t.me/${botUsername}?start=ref_${user.telegram_id}`;

        // Логируем генерацию ссылки
        await db.run(
            'INSERT INTO referral_clicks (referrer_id) VALUES (?)',
            userId
        );

        res.json({
            success: true,
            link: referralLink
        });

    } catch (error) {
        console.error('Error generating referral link:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получение списка рефералов
router.get('/list/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const db = getDb();
        const referrals = await db.all(
            `SELECT r.*, u.first_name, u.last_name, u.username 
             FROM referrals r 
             JOIN users u ON r.referred_id = u.id 
             WHERE r.referrer_id = ? 
             ORDER BY r.created_at DESC`,
            userId
        );

        // Получаем статистику по кликам
        const clicks = await db.get(
            'SELECT COUNT(*) as total FROM referral_clicks WHERE referrer_id = ?',
            userId
        );

        res.json({
            success: true,
            referrals: referrals.map(ref => ({
                id: ref.id,
                name: `${ref.first_name} ${ref.last_name || ''}`.trim(),
                username: ref.username,
                bonus: ref.bonus,
                date: ref.created_at
            })),
            stats: {
                total_clicks: clicks?.total || 0,
                total_referrals: referrals.length
            }
        });

    } catch (error) {
        console.error('Error getting referrals:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Обработка перехода по реферальной ссылке
router.post('/process', async (req, res) => {
    try {
        const { referrerTelegramId, referredUserData } = req.body;

        const db = getDb();

        // Находим реферера
        const referrer = await db.get(
            'SELECT * FROM users WHERE telegram_id = ?',
            referrerTelegramId
        );

        if (!referrer) {
            return res.status(404).json({ error: 'Referrer not found' });
        }

        // Находим или создаем приглашенного пользователя
        let referred = await db.get(
            'SELECT * FROM users WHERE telegram_id = ?',
            referredUserData.id
        );

        if (!referred) {
            const result = await db.run(
                `INSERT INTO users (telegram_id, first_name, last_name, username, photo_url, language_code) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                referredUserData.id,
                referredUserData.first_name,
                referredUserData.last_name || null,
                referredUserData.username || null,
                referredUserData.photo_url || null,
                referredUserData.language_code || 'ru'
            );

            const referredId = result.lastID;
            referred = await db.get('SELECT * FROM users WHERE id = ?', referredId);

            // Создаем статистику
            await db.run(
                'INSERT INTO user_stats (user_id) VALUES (?)',
                referredId
            );
        }

        // Проверяем, не было ли уже реферала
        const existingReferral = await db.get(
            'SELECT * FROM referrals WHERE referrer_id = ? AND referred_id = ?',
            referrer.id,
            referred.id
        );

        if (!existingReferral && referrer.id !== referred.id) {
            // Добавляем реферала
            await db.run(
                'INSERT INTO referrals (referrer_id, referred_id, bonus) VALUES (?, ?, ?)',
                referrer.id,
                referred.id,
                50
            );

            // Обновляем статистику реферера
            await db.run(
                `UPDATE user_stats 
                 SET total_referrals = total_referrals + 1,
                     balance = balance + 50,
                     total_earned = total_earned + 50
                 WHERE user_id = ?`,
                referrer.id
            );

            // Обновляем статистику приглашенного
            await db.run(
                `UPDATE user_stats 
                 SET balance = balance + 10
                 WHERE user_id = ?`,
                referred.id
            );
        }

        res.json({
            success: true,
            message: 'Referral processed successfully',
            bonus_added: !existingReferral
        });

    } catch (error) {
        console.error('Error processing referral:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;