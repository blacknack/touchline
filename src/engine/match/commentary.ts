import { RNG } from '../rng';

type Ctx = { p?: string; a?: string; team?: string; opp?: string; gk?: string; d?: string; min?: number; score?: string };

const T: Record<string, string[]> = {
  kickoff: ['We are underway at {venue}!', 'The referee blows his whistle and we\'re off.', 'Kick-off! {team} get us started.'],
  secondhalf: ['The second half is underway.', 'Back out for the second period.', 'We\'re back under way for the second 45.'],
  halftime: ['Half-time. {score}.', 'The referee brings the first half to a close. {score}.'],
  fulltime: ['Full-time! It finishes {score}.', 'That\'s the final whistle. {score}.', 'It\'s all over. {score}.'],
  goal: [
    'GOAL! {p} finishes it off for {team}! {score}',
    'GOAL! {p} slots it home! {a} with the assist. {score}',
    '{p} scores! A clinical finish from the {team} man. {score}',
    'It\'s in! {p} makes no mistake from close range. {score}',
    'GOAL for {team}! {p} beats {gk} with a superb strike. {score}',
    '{a} picks out {p} and it\'s a goal! {score}',
    'What a moment! {p} turns and fires into the bottom corner. {score}',
  ],
  goal_no_assist: [
    'GOAL! {p} finishes it off for {team}! {score}',
    '{p} scores! A clinical finish. {score}',
    'GOAL for {team}! {p} beats {gk}. {score}',
    'It\'s in! {p} drives it past {gk}. {score}',
  ],
  header_goal: ['GOAL! {p} rises highest and heads it in! {score}', 'Towering header from {p} — {team} lead the way! {score}', '{a} swings it in and {p} powers a header past {gk}! {score}'],
  longshot_goal: ['WHAT A STRIKE! {p} lets fly from 25 yards and it screams into the top corner! {score}', 'GOAL! {p} tries his luck from distance and {gk} can\'t get near it! {score}'],
  fk_goal: ['GOAL! {p} curls the free kick over the wall and in! {gk} rooted to the spot. {score}', 'Sensational free kick from {p}! Straight into the top corner. {score}'],
  pen_goal: ['GOAL! {p} sends {gk} the wrong way from the spot. {score}', '{p} steps up... and buries the penalty! {score}', 'Cool as you like — {p} converts the penalty. {score}'],
  pen_miss: ['{p} blazes the penalty over the bar! What a let-off for {opp}!', 'Off the post! {p} can\'t believe it — the penalty comes back off the woodwork.'],
  pen_saved: ['SAVED! {gk} guesses right and keeps out {p}\'s penalty!', 'Penalty saved! {gk} is the hero, diving low to his left to deny {p}.'],
  own_goal: ['Oh no! {p} turns it into his own net! {score}', 'Own goal! {p} diverts the cross past his own keeper. {score}'],
  penalty_awarded: ['PENALTY to {team}! {d} brings down {p} in the box and the referee points to the spot.', 'The referee points to the spot! {p} was clipped by {d}. Penalty to {team}.', 'Handball! Penalty to {team} after {d} blocks it with his arm.'],
  save: ['{gk} gets down well to save from {p}.', 'Good stop by {gk} to deny {p}.', '{p} works {gk}, who gathers.', '{p} tests {gk} from the edge of the box — held.'],
  big_save: ['WHAT A SAVE! {gk} somehow claws {p}\'s effort away!', 'Brilliant from {gk}! He denies {p} from point-blank range.', 'How has that stayed out?! {gk} with a stunning reflex save from {p}.'],
  shot_off: ['{p} drags his shot wide of the far post.', '{p} sends it over the bar from a good position.', '{p} shoots... just wide!', 'Chance for {p}, but it flies over.'],
  shot_blocked: ['{p}\'s shot is blocked by {d}.', '{d} throws himself in the way to block {p}\'s effort.', 'Blocked! {d} denies {p}.'],
  post: ['OFF THE POST! {p} is denied by the woodwork!', '{p} rattles the crossbar! So close for {team}.', 'The post! {p}\'s effort beats {gk} but not the upright.'],
  chance_miss: ['{p} should have scored there! He miscues from eight yards out.', 'Big chance wasted by {p}!', '{p} gets it all wrong with the goal gaping.'],
  big_chance: ['{team} building an attack down the flank... {a} looks for {p}...', '{a} slides a ball through for {p}!'],
  corner: ['Corner to {team}.', '{team} win a corner.', 'Deflected behind for a {team} corner.'],
  freekick: ['Free kick to {team} in a dangerous position after {d} fouls {p}.', '{d} brings down {p}. Free kick, {team}, about 25 yards out.'],
  offside: ['{p} is flagged offside.', 'The flag goes up against {p}.', 'Offside, {p}. Marginal.'],
  foul: ['Foul by {d} on {p}.', '{d} is penalised for a challenge on {p}.', 'Free kick to {team}; {d} was late on {p}.'],
  yellow: ['Yellow card for {d} after a cynical foul on {p}.', '{d} goes into the book for a late challenge.', 'The referee shows {d} a yellow card.', 'Booking for {d} — dissent.'],
  second_yellow: ['SECOND YELLOW! {d} is off! {opp} down to ten men.', 'That\'s his second booking — {d} is sent off!'],
  red: ['STRAIGHT RED! {d} is sent off for a horrendous tackle on {p}!', 'RED CARD! {d} is given his marching orders. {opp} down to ten.', 'Red card! {d} denied a clear goalscoring opportunity.'],
  injury: ['{p} is down and receiving treatment. This doesn\'t look good.', 'Injury concern for {team} — {p} can\'t continue.', '{p} pulls up clutching his hamstring.'],
  sub: ['Substitution for {team}: {p} replaces {a}.', '{team} make a change: {a} off, {p} on.', '{a} makes way for {p}.'],
  tactic: ['{team} change shape.', 'A tactical tweak from the {team} bench.'],
  et_start: ['We go to extra time!', 'Extra time it is — 30 more minutes to settle this.'],
  et_half: ['Half-time in extra time.'],
  et_end: ['End of extra time. This will be decided by penalties!'],
  shootout_goal: ['{p} scores! {score}', '{p} slots it in. {score}', 'Calm as you like from {p}. {score}'],
  shootout_miss: ['{p} misses! He puts it wide.', 'SAVED! {gk} keeps out {p}!', '{p} hits the bar!'],
  pressure: ['{team} are turning the screw here.', '{team} are dominating possession.', 'It\'s all {team} at the moment.', '{team} pressing high and winning the ball back quickly.'],
  quiet: ['A lull in the game as both sides catch their breath.', 'Possession being traded in midfield.', '{team} knocking it around at the back.', 'Not much happening in the last few minutes.'],
  added_time: ['{min} minutes of added time.', 'The board goes up: {min} added minutes.'],
  var: ['VAR check in progress...', 'The referee is going to the monitor.'],
  var_overturn: ['VAR overturns the decision! No goal.', 'The goal is ruled out after a VAR review — offside in the build-up.'],
  var_confirm: ['VAR confirms — the goal stands!', 'After review, the on-field decision stands.'],
  hitpost_goal: [],
};

export function say(rng: RNG, key: string, ctx: Ctx & { venue?: string }): string {
  const arr = T[key] ?? [key];
  let s = arr.length ? rng.pick(arr) : key;
  const map: Record<string, string | number | undefined> = { p: ctx.p, a: ctx.a, team: ctx.team, opp: ctx.opp, gk: ctx.gk, d: ctx.d, min: ctx.min, score: ctx.score, venue: ctx.venue };
  for (const k of Object.keys(map)) s = s.split(`{${k}}`).join(String(map[k] ?? ''));
  return s.replace(/\s+\./g, '.').replace(/\s{2,}/g, ' ').trim();
}
