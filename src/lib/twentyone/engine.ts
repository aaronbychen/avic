import { SPECIFIC_DRAW, TRUMPS, TRUMP_LIST } from './cards';
import { randInt, shuffle, type Rng } from './rng';
import {
  DRAW_BONUS_CHANCE,
  HAND_LIMIT,
  MAX_HP,
  ROUNDS_TO_WIN,
  START_TRUMPS,
  bestCard,
  betOf,
  cardTotal,
  decideWinner,
  other,
  targetOf,
  trumpBlockReason,
} from './rules';
import type { Action, GameState, PlayerName, PlayerState, Trump } from './types';

const LOG_LIMIT = 40;
const TOTAL_POOL_WEIGHT = TRUMP_LIST.reduce((sum, d) => sum + d.weight, 0);

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: string };

function emptyPlayer(): PlayerState {
  return { hp: MAX_HP, roundsWon: 0, cards: [], table: [], hand: [] };
}

function log(s: GameState, actor: PlayerName | null, publicText: string, privateText?: string) {
  s.log.push({ seq: s.nextSeq++, actor, publicText, privateText });
  if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
}

function pickTrump(s: GameState, rng: Rng): Trump {
  let roll = rng() * TOTAL_POOL_WEIGHT;
  for (const def of TRUMP_LIST) {
    roll -= def.weight;
    if (roll < 0) return { uid: `t${s.nextSeq++}`, id: def.id };
  }
  return { uid: `t${s.nextSeq++}`, id: TRUMP_LIST[TRUMP_LIST.length - 1].id };
}

function giveTrumps(s: GameState, p: PlayerName, n: number, rng: Rng) {
  const hand = s.players[p].hand;
  const got: string[] = [];
  let dropped = 0;
  for (let i = 0; i < n; i++) {
    const t = pickTrump(s, rng);
    if (hand.length >= HAND_LIMIT) {
      dropped++;
      continue;
    }
    hand.push(t);
    got.push(TRUMPS[t.id].name);
  }
  if (got.length > 0) {
    log(s, p, `获得 ${got.length} 张王牌`, `获得王牌：${got.join('、')}`);
  }
  if (dropped > 0) {
    log(s, p, `王牌已满，丢弃了 ${dropped} 张新王牌`);
  }
}

function returnToDeck(s: GameState, value: number, rng: Rng) {
  s.deck.splice(randInt(rng, s.deck.length + 1), 0, value);
}

function lastFaceUpIndex(p: PlayerState): number {
  const i = p.cards.length - 1;
  return i >= 0 && p.cards[i].faceUp ? i : -1;
}

function addCard(p: PlayerState, value: number) {
  p.cards.push({ value, faceUp: true });
}

function currentTarget(s: GameState): number {
  return targetOf([s.players.Aaron.table, s.players.Vicky.table]);
}

function startHand(s: GameState, rng: Rng) {
  s.handsPlayed++;
  s.handNo++;
  s.firstPlayer = s.handsPlayed === 1 ? (rng() < 0.5 ? 'Aaron' : 'Vicky') : other(s.firstPlayer);
  s.turn = s.firstPlayer;
  s.deck = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], rng);
  for (const name of ['Aaron', 'Vicky'] as const) {
    const p = s.players[name];
    p.table = [];
    p.cards = [
      { value: s.deck.pop()!, faceUp: false },
      { value: s.deck.pop()!, faceUp: true },
    ];
  }
  s.consecutiveStays = 0;
  s.result = null;
  s.phase = 'playing';
  log(s, null, `第 ${s.round} 轮 · 第 ${s.handNo} 局开始，${s.firstPlayer} 先手`);
  giveTrumps(s, s.firstPlayer, 1, rng);
  giveTrumps(s, other(s.firstPlayer), 1, rng);
}

export function newMatch(rng: Rng, version = 0): GameState {
  const s: GameState = {
    matchId: Math.floor(rng() * 2 ** 32).toString(36),
    version,
    phase: 'playing',
    round: 1,
    handNo: 0,
    handsPlayed: 0,
    firstPlayer: 'Aaron',
    turn: 'Aaron',
    deck: [],
    players: { Aaron: emptyPlayer(), Vicky: emptyPlayer() },
    consecutiveStays: 0,
    result: null,
    matchWinner: null,
    log: [],
    nextSeq: 1,
  };
  log(s, null, '新的一场开始，双方各获得 6 张王牌');
  giveTrumps(s, 'Aaron', START_TRUMPS, rng);
  giveTrumps(s, 'Vicky', START_TRUMPS, rng);
  startHand(s, rng);
  return s;
}

function settle(s: GameState) {
  const target = currentTarget(s);
  const totals = {
    Aaron: cardTotal(s.players.Aaron.cards),
    Vicky: cardTotal(s.players.Vicky.cards),
  };
  const winner = decideWinner(totals, target);
  let damage = 0;
  let roundWinner: PlayerName | null = null;
  if (winner) {
    const loser = other(winner);
    const lp = s.players[loser];
    damage = betOf(lp.table, s.players[winner].table);
    lp.hp = Math.max(0, lp.hp - damage);
    log(s, null, `开牌：${winner} ${totals[winner]} 点胜 ${loser} ${totals[loser]} 点，${loser} 失去 ${damage} 滴血`);
    if (lp.hp <= 0) {
      roundWinner = winner;
      s.players[winner].roundsWon++;
      log(s, null, `${winner} 赢下第 ${s.round} 轮`);
    }
  } else {
    log(s, null, `开牌：双方都是 ${totals.Aaron} 点，平局`);
  }
  s.result = {
    winner,
    totals,
    cards: {
      Aaron: s.players.Aaron.cards.map((c) => c.value),
      Vicky: s.players.Vicky.cards.map((c) => c.value),
    },
    target,
    damage,
    roundWinner,
  };
  if (roundWinner && s.players[roundWinner].roundsWon >= ROUNDS_TO_WIN) {
    s.matchWinner = roundWinner;
    s.phase = 'match-over';
    log(s, null, `${roundWinner} 赢得整场比赛`);
  } else {
    s.phase = 'hand-result';
  }
}

function playTrump(s: GameState, actor: PlayerName, uid: string, rng: Rng): string | null {
  const me = s.players[actor];
  const oppName = other(actor);
  const opp = s.players[oppName];
  const idx = me.hand.findIndex((t) => t.uid === uid);
  if (idx < 0) return '你没有这张王牌';
  const trump = me.hand[idx];
  const def = TRUMPS[trump.id];
  const target = currentTarget(s);
  const blocked = trumpBlockReason({
    def,
    ownTotal: cardTotal(me.cards),
    target,
    ownTable: me.table,
    oppTable: opp.table,
  });
  if (blocked) return blocked;

  me.hand.splice(idx, 1);
  const harvests = me.table.filter((t) => t.id === 59).length;
  log(s, actor, `使用了「${def.name}」`);

  const drawNumber = (value: number | undefined) => {
    if (value === undefined) {
      log(s, actor, '牌组已空，王牌已丢弃');
      return;
    }
    s.deck.splice(s.deck.indexOf(value), 1);
    addCard(me, value);
    log(s, actor, `抽到了 ${value}`);
  };
  const returnLast = (p: PlayerState, who: string) => {
    const i = lastFaceUpIndex(p);
    if (i < 0) {
      log(s, actor, `${who}没有面朝上的牌，王牌已丢弃`);
      return;
    }
    const [card] = p.cards.splice(i, 1);
    returnToDeck(s, card.value, rng);
    log(s, actor, `${who}的 ${card.value} 被退回牌组`);
  };
  const destroyAll = () => {
    if (opp.table.length === 0) {
      log(s, actor, '对手牌桌上没有王牌');
      return;
    }
    log(s, actor, `撤除了对手的${opp.table.map((t) => `「${TRUMPS[t.id].name}」`).join('')}`);
    opp.table = [];
  };

  const specific = SPECIFIC_DRAW[trump.id];
  if (specific !== undefined) {
    if (s.deck.includes(specific)) drawNumber(specific);
    else log(s, actor, `牌组中没有 ${specific}，王牌已丢弃`);
  } else {
    switch (trump.id) {
      case 12:
        giveTrumps(s, actor, 1, rng);
        break;
      case 13:
        returnLast(opp, '对手');
        break;
      case 45:
      case 47:
        drawNumber(bestCard(s.deck, cardTotal(me.cards), target));
        break;
      case 46:
        drawNumber(bestCard(s.deck, cardTotal(me.cards), target));
        giveTrumps(s, actor, 2, rng);
        break;
      case 51:
      case 52: {
        const discard = Math.min(trump.id === 51 ? 2 : 1, me.hand.length);
        const lost: string[] = [];
        for (let i = 0; i < discard; i++) {
          const [t] = me.hand.splice(randInt(rng, me.hand.length), 1);
          lost.push(TRUMPS[t.id].name);
        }
        if (discard > 0) log(s, actor, `随机放弃了 ${discard} 张王牌`, `随机放弃了：${lost.join('、')}`);
        giveTrumps(s, actor, trump.id === 51 ? 3 : 4, rng);
        break;
      }
      case 53: {
        const mi = lastFaceUpIndex(me);
        const oi = lastFaceUpIndex(opp);
        if (mi < 0 || oi < 0) {
          log(s, actor, '没有可以交换的面朝上的牌，王牌已丢弃');
          break;
        }
        const mine = me.cards[mi].value;
        me.cards[mi].value = opp.cards[oi].value;
        opp.cards[oi].value = mine;
        log(s, actor, `用 ${mine} 换走了对手的 ${me.cards[mi].value}`);
        break;
      }
      case 54:
        returnLast(me, '自己');
        break;
      case 55:
        returnLast(opp, '对手');
        break;
      case 56: {
        const t = opp.table.pop();
        if (t) log(s, actor, `撤除了对手的「${TRUMPS[t.id].name}」`);
        else log(s, actor, '对手牌桌上没有王牌');
        break;
      }
      case 57:
      case 58:
        destroyAll();
        break;
      case 80:
      case 81:
        me.table = me.table.filter((t) => !TRUMPS[t.id].goFor);
        opp.table = opp.table.filter((t) => !TRUMPS[t.id].goFor);
        break;
    }
  }

  if (def.kind === 'table') me.table.push(trump);
  if (harvests > 0) giveTrumps(s, actor, harvests, rng);
  s.consecutiveStays = 0;
  return null;
}

export function applyAction(state: GameState, actor: PlayerName, action: Action, rng: Rng): ActionResult {
  if (action.type === 'new-match') {
    if (state.phase !== 'match-over') return { ok: false, error: '比赛还没结束' };
    return { ok: true, state: newMatch(rng, state.version + 1) };
  }

  const s = structuredClone(state);

  if (action.type === 'next-hand') {
    if (s.phase !== 'hand-result') return { ok: false, error: '这一局还没结束' };
    if (s.result?.roundWinner) {
      s.round++;
      s.handNo = 0;
      s.players.Aaron.hp = MAX_HP;
      s.players.Vicky.hp = MAX_HP;
    }
    startHand(s, rng);
    s.version++;
    return { ok: true, state: s };
  }

  if (s.phase !== 'playing') return { ok: false, error: '这一局已经结束' };
  if (s.turn !== actor) return { ok: false, error: '还没轮到你' };
  const me = s.players[actor];

  switch (action.type) {
    case 'use-trump': {
      const err = playTrump(s, actor, action.uid, rng);
      if (err) return { ok: false, error: err };
      break;
    }
    case 'draw': {
      if (cardTotal(me.cards) > currentTarget(s)) return { ok: false, error: '点数爆掉之后就不能抽牌了' };
      if (s.deck.length === 0) return { ok: false, error: '牌组已经空了' };
      const value = s.deck.pop()!;
      addCard(me, value);
      log(s, actor, `抽了一张牌：${value}`);
      if (rng() < DRAW_BONUS_CHANCE) giveTrumps(s, actor, 1, rng);
      s.consecutiveStays = 0;
      s.turn = other(actor);
      break;
    }
    case 'stay': {
      s.consecutiveStays++;
      log(s, actor, '停牌');
      if (s.consecutiveStays >= 2) settle(s);
      else s.turn = other(actor);
      break;
    }
  }

  s.version++;
  return { ok: true, state: s };
}
