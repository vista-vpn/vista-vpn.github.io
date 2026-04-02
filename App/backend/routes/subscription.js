const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

const PLANS = {
    basic: { price: 299, days: 30, devices: 1 },
    pro: { price: 799, days: 90, devices: 5 },
    ultimate: { price: 1999, days: 365, devices: 999 }
};

// Получение активной подписки
router.get('/active/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const db = getDb();
        const subscription = await db.get(
            `SELECT * FROM subscriptions 
             WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now') 
             ORDER BY expires_at DESC LIMIT 1`,
            userId
        );

        res.json({
            success: true,
            subscription: subscription ? {
                plan: subscription.plan_type,
                price: subscription.price,
                started_at: subscription.started_at,
                expires_at: subscription.expires_at
            } : null
        });

    } catch (error) {
        console.error('Error getting subscription:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Создание подписки
router.post('/create', async (req, res) => {
    try {
        const { userId, planType, paymentData } = req.body;

        const plan = PLANS[planType];
        if (!plan) {
            return res.status(400).json({ error: 'Invalid plan type' });
        }

        const db = getDb();

        // Деактивируем старые подписки
        await db.run(
            `UPDATE subscriptions 
             SET status = 'expired' 
             WHERE user_id = ? AND status = 'active'`,
            userId
        );

        // Создаем новую подписку
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + plan.days);

        const result = await db.run(
            `INSERT INTO subscriptions (user_id, plan_type, status, price, expires_at) 
             VALUES (?, ?, ?, ?, ?)`,
            userId,
            planType,
            'active',
            plan.price,
            expiresAt.toISOString()
        );

        // Здесь можно добавить логику оплаты через Telegram Stars
        // В реальном проекте нужно интегрироваться с Telegram Payments API

        const subscription = await db.get(
            'SELECT * FROM subscriptions WHERE id = ?',
            result.lastID
        );

        res.json({
            success: true,
            subscription: {
                id: subscription.id,
                plan: subscription.plan_type,
                price: subscription.price,
                expires_at: subscription.expires_at
            }
        });

    } catch (error) {
        console.error('Error creating subscription:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Активация пробного периода
router.post('/trial', async (req, res) => {
    try {
        const { userId } = req.body;

        const db = getDb();

        // Проверяем, был ли уже пробный период
        const existingTrial = await db.get(
            `SELECT * FROM subscriptions 
             WHERE user_id = ? AND plan_type = 'trial'`,
            userId
        );

        if (existingTrial) {
            return res.status(400).json({ error: 'Trial period already used' });
        }

        // Создаем пробную подписку на 3 дня
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 3);

        await db.run(
            `INSERT INTO subscriptions (user_id, plan_type, status, price, expires_at) 
             VALUES (?, ?, ?, ?, ?)`,
            userId,
            'trial',
            'active',
            0,
            expiresAt.toISOString()
        );

        res.json({
            success: true,
            message: 'Trial period activated for 3 days'
        });

    } catch (error) {
        console.error('Error activating trial:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;