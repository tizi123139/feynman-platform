// services/studyPlanService.js
// 今日学习计划排程：把「到期复习 / 薄弱点 / 待复述 / 播新种子」排成一组番茄序列

const DAY_MS = 24 * 60 * 60 * 1000;

// 每类任务的预估时长与展示信息
const TYPE_META = {
    review: { minutes: 6, tone: 'butter', badge: '到期复习' },
    feynman: { minutes: 8, tone: 'mint', badge: '费曼复述' },
    quiz: { minutes: 6, tone: 'sky', badge: '随机测验' },
    create: { minutes: 6, tone: 'coral', badge: '播新种子' },
};

// 每档优先级最多排几条，避免一天塞满（总时长约 45 分钟）
const LIMITS = { due: 4, weak: 2, fresh: 1, create: 1 };
const PRIORITY = { due: 0.94, weak: 0.74, fresh: 0.66, create: 0.58 };

const clampInt = (value, min, max) => Math.max(min, Math.min(max, Math.round(Number(value) || 0)));

function shortTitle(title, max = 16) {
    const text = String(title || '').trim();
    if (!text) return '未命名知识点';
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * 到期信息：返回 null 表示还没到期
 * 兼容没有 review.dueAt 的旧数据（创建满一天即视为待复习，与 dueFilter 保持一致）
 */
function dueInfo(kp, now = Date.now()) {
    const dueAt = kp?.review?.dueAt;
    if (dueAt) {
        const due = new Date(dueAt).getTime();
        if (!Number.isFinite(due) || due > now) return null;
        const days = Math.floor((now - due) / DAY_MS);
        return {
            days,
            reason: days >= 1 ? `已经到期 ${days} 天，再不复习会明显变淡` : '今天刚到期，趁热回顾一下',
        };
    }
    const created = new Date(kp?.createdAt || 0).getTime();
    if (!Number.isFinite(created) || !created || now - created < DAY_MS) return null;
    const days = Math.floor((now - created) / DAY_MS);
    return { days, reason: `创建 ${days} 天了还没安排过复习` };
}

function masteryOf(kp) {
    return clampInt(kp?.mastery ?? 0, 0, 100);
}

function isWeak(kp) {
    const stats = kp?.stats || {};
    const practiced = (stats.feynmanCount || 0) + (stats.quizCount || 0);
    return masteryOf(kp) < 60 && (practiced > 0 || kp?.status === 'in_progress');
}

function isFresh(kp) {
    const stats = kp?.stats || {};
    return (stats.feynmanCount || 0) === 0 && masteryOf(kp) < 80;
}

function todayStats(todayLogs = []) {
    const counts = { created: 0, reviewed: 0, practiced: 0, minutes: 0, xp: 0 };
    todayLogs.forEach((log) => {
        if (log.type === 'create') counts.created += 1;
        if (log.type === 'review') counts.reviewed += 1;
        if (log.type === 'feynman' || log.type === 'quiz') counts.practiced += 1;
        counts.minutes += Number(log.minutes) || 0;
        counts.xp += Number(log.xp) || 0;
    });
    return counts;
}

/**
 * 生成按优先级排序的任务列表
 * @returns {{ items: object[], counts: object }}
 */
function buildPlanItems({ points = [], todayLogs = [], now = Date.now() } = {}) {
    const today = todayStats(todayLogs);
    const due = [];
    const weak = [];
    const fresh = [];

    points.forEach((kp) => {
        const info = dueInfo(kp, now);
        if (info) {
            due.push({ kp, info });
            return;
        }
        if (isWeak(kp)) {
            weak.push(kp);
            return;
        }
        if (isFresh(kp)) fresh.push(kp);
    });

    due.sort((a, b) => b.info.days - a.info.days || masteryOf(a.kp) - masteryOf(b.kp));
    weak.sort((a, b) => masteryOf(a) - masteryOf(b));
    fresh.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

    const picked = [
        ...due.slice(0, LIMITS.due).map(({ kp, info }) => ({ type: 'review', kp, reason: info.reason, priority: PRIORITY.due - Math.min(0.1, info.days * 0.01) })),
        ...weak.slice(0, LIMITS.weak).map((kp) => ({
            type: 'feynman',
            kp,
            reason: `掌握度只有 ${masteryOf(kp)}，用自己的话讲一遍能把洞补上`,
            priority: PRIORITY.weak,
        })),
        ...fresh.slice(0, LIMITS.fresh).map((kp) => ({
            type: 'feynman',
            kp,
            reason: '还没开口讲过，第一次复述最能暴露理解的缺口',
            priority: PRIORITY.fresh,
        })),
    ];

    if (today.created === 0) {
        picked.push({
            type: 'create',
            kp: null,
            reason: '今天还没有新知识点，给它留 6 分钟',
            priority: PRIORITY.create,
        });
    }

    picked.sort((a, b) => b.priority - a.priority);

    // 今天已经复习/练习过几次，就点亮前面几条（让进度可感知）
    let reviewQuota = today.reviewed;
    let practiceQuota = today.practiced;

    const items = picked.map((entry, index) => {
        const meta = TYPE_META[entry.type];
        let done = false;
        if (entry.type === 'review') {
            done = reviewQuota > 0;
            if (done) reviewQuota -= 1;
        } else if (entry.type === 'feynman' || entry.type === 'quiz') {
            done = practiceQuota > 0;
            if (done) practiceQuota -= 1;
        } else if (entry.type === 'create') {
            done = today.created > 0;
        }

        const id = entry.kp?._id ? String(entry.kp._id) : `plan-${entry.type}`;
        const title = entry.kp?.title || '新建一个知识点';
        return {
            id,
            key: `${entry.type}-${id}-${index}`,
            type: entry.type,
            title,
            shortTitle: shortTitle(title),
            reason: entry.reason,
            minutes: meta.minutes,
            badge: meta.badge,
            tone: meta.tone,
            priority: Number(entry.priority.toFixed(2)),
            mastery: entry.kp ? masteryOf(entry.kp) : null,
            category: entry.kp?.category || null,
            done,
            link: entry.type === 'review' ? '/review' : entry.type === 'create' ? '/kp/new' : entry.type === 'quiz' ? `/quiz/${id}` : `/feynman/${id}`,
        };
    });

    return {
        items,
        today,
        counts: { due: due.length, weak: weak.length, fresh: fresh.length },
    };
}

/**
 * 把任务装进番茄桶：攒够 focus 分钟就开一个新番茄
 */
function buildPomodoros(items = [], focus = 25, rest = 5) {
    const blocks = [];
    items.forEach((item) => {
        let block = blocks[blocks.length - 1];
        if (!block || block.minutes + item.minutes > focus) {
            block = { index: blocks.length + 1, minutes: 0, items: [], titles: [] };
            blocks.push(block);
        }
        block.minutes += item.minutes;
        block.items.push(item.key);
        block.titles.push(item.shortTitle);
    });

    return blocks.map((block) => ({
        index: block.index,
        label: block.titles.length > 1 ? `${block.titles[0]} 等 ${block.titles.length} 项` : block.titles[0],
        minutes: block.minutes,
        focus,
        rest,
        items: block.items,
    }));
}

function buildSummary({ items, counts, today, plannedMinutes }) {
    if (items.length === 0) {
        return today.minutes > 0
            ? `今天的安排已经清空，你投入了 ${today.minutes} 分钟。去知识宇宙里再种一颗新种子吧。`
            : '还没有知识点可以安排，先记录一个概念，系统会自动帮你排出明天要做的事。';
    }
    const parts = [];
    if (counts.due > 0) parts.push(`${counts.due} 个到期复习`);
    if (counts.weak > 0) parts.push(`${counts.weak} 个薄弱点`);
    if (counts.fresh > 0) parts.push(`${counts.fresh} 个待复述`);
    const head = parts.length > 0 ? `今天有 ${parts.join('、')}` : '今天从一颗新种子开始';
    return `${head}，已排入 ${items.length} 项，预计 ${plannedMinutes} 分钟能走完一轮。`;
}

/**
 * 今日学习计划（纯函数，便于单测）
 */
function buildTodayPlan({ points = [], todayLogs = [], focus = 25, rest = 5, now = Date.now() } = {}) {
    const safeFocus = clampInt(focus, 10, 60) || 25;
    const safeRest = clampInt(rest, 3, 20) || 5;
    const { items, today, counts } = buildPlanItems({ points, todayLogs, now });
    const plannedMinutes = items.reduce((sum, item) => sum + item.minutes, 0);
    const doneMinutes = items.filter((item) => item.done).reduce((sum, item) => sum + item.minutes, 0);
    const date = new Date(now);
    const dateKeyValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    return {
        date: dateKeyValue,
        focus: safeFocus,
        rest: safeRest,
        plannedMinutes,
        doneMinutes,
        percent: plannedMinutes > 0 ? Math.min(100, Math.round((doneMinutes / plannedMinutes) * 100)) : 0,
        summary: buildSummary({ items, counts, today, plannedMinutes }),
        today,
        counts,
        items,
        pomodoros: buildPomodoros(items, safeFocus, safeRest),
    };
}

module.exports = {
    TYPE_META,
    buildTodayPlan,
    buildPlanItems,
    buildPomodoros,
    dueInfo,
    shortTitle,
};
