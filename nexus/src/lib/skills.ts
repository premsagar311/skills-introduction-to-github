import { Note, Reminder } from "../types";

export interface SkillContext {
  addNote: (text: string) => void;
  listNotes: () => Note[];
  clearNotes: () => void;
  addReminder: (text: string, dueAt: number) => void;
  listReminders: () => Reminder[];
  clearReminders: () => void;
  clearConversation: () => void;
  openUrl: (url: string) => void;
  stopSpeaking: () => void;
}

export interface SkillResult {
  text: string;
  /** True when the reply already answers the user and no LLM call is needed. */
  handled: true;
}

type Skill = (utterance: string, ctx: SkillContext) => string | null;

const SITES: Record<string, string> = {
  youtube: "https://www.youtube.com",
  google: "https://www.google.com",
  gmail: "https://mail.google.com",
  github: "https://github.com",
  maps: "https://maps.google.com",
  "google maps": "https://maps.google.com",
  whatsapp: "https://web.whatsapp.com",
  wikipedia: "https://www.wikipedia.org",
  instagram: "https://www.instagram.com",
  spotify: "https://open.spotify.com",
  netflix: "https://www.netflix.com",
  twitter: "https://twitter.com",
  x: "https://x.com",
  reddit: "https://www.reddit.com",
  linkedin: "https://www.linkedin.com",
  amazon: "https://www.amazon.com",
  weather: "https://www.google.com/search?q=weather",
  news: "https://news.google.com",
};

const JOKES = [
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "I told my computer I needed a break, and now it will not stop sending me KitKat ads.",
  "There are two hard things in computing: cache invalidation, naming things, and off by one errors.",
  "Why did the developer go broke? Because he used up all his cache.",
];

/** Linear conversions expressed as a factor from the left unit to the right unit. */
const LENGTH_AND_MASS: Record<string, { to: string; factor: number }> = {
  km: { to: "miles", factor: 0.621371 },
  kilometre: { to: "miles", factor: 0.621371 },
  kilometres: { to: "miles", factor: 0.621371 },
  kilometer: { to: "miles", factor: 0.621371 },
  kilometers: { to: "miles", factor: 0.621371 },
  mile: { to: "kilometres", factor: 1.609344 },
  miles: { to: "kilometres", factor: 1.609344 },
  kg: { to: "pounds", factor: 2.204623 },
  kilo: { to: "pounds", factor: 2.204623 },
  kilos: { to: "pounds", factor: 2.204623 },
  kilogram: { to: "pounds", factor: 2.204623 },
  kilograms: { to: "pounds", factor: 2.204623 },
  pound: { to: "kilograms", factor: 0.453592 },
  pounds: { to: "kilograms", factor: 0.453592 },
  lb: { to: "kilograms", factor: 0.453592 },
  lbs: { to: "kilograms", factor: 0.453592 },
  cm: { to: "inches", factor: 0.393701 },
  centimetres: { to: "inches", factor: 0.393701 },
  centimeters: { to: "inches", factor: 0.393701 },
  inch: { to: "centimetres", factor: 2.54 },
  inches: { to: "centimetres", factor: 2.54 },
};

const HOLIDAYS: Record<string, [number, number]> = {
  christmas: [11, 25],
  "christmas day": [11, 25],
  "new year": [0, 1],
  "new years": [0, 1],
  "new year's day": [0, 1],
  halloween: [9, 31],
};

const UNIT_MS: Record<string, number> = {
  second: 1000,
  seconds: 1000,
  sec: 1000,
  secs: 1000,
  minute: 60_000,
  minutes: 60_000,
  min: 60_000,
  mins: 60_000,
  hour: 3_600_000,
  hours: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
};

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  sixty: 60,
  half: 0.5,
};

function parseCount(raw: string): number | null {
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric;
  const word = WORD_NUMBERS[raw.trim().toLowerCase()];
  return word ?? null;
}

/** Evaluates a simple arithmetic expression without using eval(). */
export function evaluateArithmetic(expression: string): number | null {
  const normalised = expression
    .toLowerCase()
    .replace(/plus|add/g, "+")
    .replace(/minus|subtract/g, "-")
    .replace(/times|multiplied by|multiply by|multiply|x(?=\s*\d)/g, "*")
    .replace(/divided by|divide by|over/g, "/")
    .replace(/percent of/g, "% of")
    .replace(/[^0-9+\-*/().^\s]/g, "")
    .trim();
  if (!normalised || !/[0-9]/.test(normalised)) return null;

  const tokens = normalised.match(/\d+(?:\.\d+)?|[+\-*/()^]/g);
  if (!tokens) return null;

  let position = 0;
  const peek = (): string | undefined => tokens[position];
  const eat = (): string | undefined => tokens[position++];

  const parseExpression = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    while (peek() === "+" || peek() === "-") {
      const op = eat();
      const right = parseTerm();
      if (right === null) return null;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  };

  const parseTerm = (): number | null => {
    let left = parsePower();
    if (left === null) return null;
    while (peek() === "*" || peek() === "/") {
      const op = eat();
      const right = parsePower();
      if (right === null) return null;
      if (op === "/" && right === 0) return null;
      left = op === "*" ? left * right : left / right;
    }
    return left;
  };

  const parsePower = (): number | null => {
    const base = parseFactor();
    if (base === null) return null;
    if (peek() === "^") {
      eat();
      const exponent = parsePower();
      if (exponent === null) return null;
      return base ** exponent;
    }
    return base;
  };

  const parseFactor = (): number | null => {
    const token = eat();
    if (token === undefined) return null;
    if (token === "-") {
      const value = parseFactor();
      return value === null ? null : -value;
    }
    if (token === "(") {
      const value = parseExpression();
      if (value === null || eat() !== ")") return null;
      return value;
    }
    const numeric = Number(token);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const result = parseExpression();
  if (result === null || position !== tokens.length || !Number.isFinite(result)) return null;
  return result;
}

function round(value: number): string {
  return String(Math.round(value * 1e6) / 1e6);
}

const skills: Skill[] = [
  // Greetings and identity
  (text) => {
    if (/^(hi|hey|hello|yo|good morning|good evening|good afternoon)\b/.test(text)) {
      const hour = new Date().getHours();
      const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
      return `Good ${part}. Nexus here. What can I do for you?`;
    }
    return null;
  },
  (text) => {
    if (/(who are you|what are you|what is your name|your name)/.test(text)) {
      return "I am Nexus, your voice assistant. I can answer questions, do maths, take notes, set reminders and open websites for you.";
    }
    return null;
  },
  (text) => {
    if (/(what can you do|help me|^help$|your skills|commands)/.test(text)) {
      return "Try: what time is it, what is twelve times nine, twenty kilometres in miles, thirty degrees celsius in fahrenheit, how many days until Christmas, spell rhythm, take a note buy milk, read my notes, remind me to stretch in ten minutes, open YouTube, search for pasta recipes, flip a coin, or just ask me anything.";
    }
    return null;
  },
  (text, ctx) => {
    if (/^(stop|be quiet|shut up|silence|cancel that)\b/.test(text)) {
      ctx.stopSpeaking();
      return "Stopped.";
    }
    return null;
  },
  (text, ctx) => {
    if (/(clear|reset|wipe)( the)? (conversation|chat|history)/.test(text)) {
      ctx.clearConversation();
      return "Conversation cleared.";
    }
    return null;
  },

  // Time and date
  (text) => {
    if (/(what(?:'s| is)? the )?time\b/.test(text) && !/timer/.test(text)) {
      return `It is ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
    }
    return null;
  },
  (text) => {
    if (/(what(?:'s| is)? (?:the )?date|what day is it|today's date|which day)/.test(text)) {
      return `Today is ${new Date().toLocaleDateString([], {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })}.`;
    }
    return null;
  },

  // Maths
  (text) => {
    const isMathish =
      /(what(?:'s| is)|calculate|compute|how much is|solve)\b/.test(text) &&
      /\d/.test(text) &&
      /(\+|-|\*|\/|\^|plus|minus|times|multiplied|divided|over|percent)/.test(text);
    if (!isMathish) return null;
    const expression = text.replace(/^(what(?:'s| is)|calculate|compute|how much is|solve)/, "");
    const result = evaluateArithmetic(expression);
    return result === null ? null : `That is ${round(result)}.`;
  },
  (text) => {
    const match = text.match(/(\d+(?:\.\d+)?)\s*(?:percent|%)\s*of\s*(\d+(?:\.\d+)?)/);
    if (!match) return null;
    return `That is ${round((Number(match[1]) / 100) * Number(match[2]))}.`;
  },

  // Notes
  (text, ctx) => {
    const match = text.match(/^(?:take|make|write|add|save)\s+(?:a\s+)?note(?:\s+(?:that|about|saying))?\s*[:,]?\s*(.+)/);
    if (!match) return null;
    const note = match[1].trim();
    if (!note) return "What should the note say?";
    ctx.addNote(note);
    return `Noted: ${note}`;
  },
  (text, ctx) => {
    if (!/(read|show|list|what are)\s+(?:me\s+)?(?:my\s+)?notes/.test(text)) return null;
    const notes = ctx.listNotes();
    if (notes.length === 0) return "You have no notes yet.";
    const spoken = notes
      .slice(-5)
      .map((note, index) => `${index + 1}. ${note.text}`)
      .join(". ");
    return `You have ${notes.length} note${notes.length === 1 ? "" : "s"}. ${spoken}`;
  },
  (text, ctx) => {
    if (!/(delete|clear|remove|erase)\s+(?:all\s+)?(?:my\s+)?notes/.test(text)) return null;
    ctx.clearNotes();
    return "All notes deleted.";
  },

  // Reminders and timers
  (text, ctx) => {
    const reminder = text.match(
      /(?:remind me to|reminder to|remind me)\s+(.+?)\s+in\s+(\d+(?:\.\d+)?|[a-z]+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)/,
    );
    if (reminder) {
      const amount = parseCount(reminder[2]);
      const unit = UNIT_MS[reminder[3]];
      if (amount === null || !unit) return null;
      const dueAt = Date.now() + amount * unit;
      ctx.addReminder(reminder[1].trim(), dueAt);
      return `Okay, I will remind you to ${reminder[1].trim()} in ${amount} ${reminder[3]}.`;
    }
    const timer = text.match(
      /(?:set|start)\s+(?:a\s+)?timer\s+(?:for\s+)?(\d+(?:\.\d+)?|[a-z]+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)/,
    );
    if (timer) {
      const amount = parseCount(timer[1]);
      const unit = UNIT_MS[timer[2]];
      if (amount === null || !unit) return null;
      ctx.addReminder("your timer is done", Date.now() + amount * unit);
      return `Timer set for ${amount} ${timer[2]}.`;
    }
    return null;
  },
  (text, ctx) => {
    if (!/(list|show|read|what are)\s+(?:me\s+)?(?:my\s+)?(reminders|timers)/.test(text)) return null;
    const pending = ctx.listReminders().filter((reminder) => !reminder.fired);
    if (pending.length === 0) return "You have no pending reminders.";
    return pending
      .map(
        (reminder) =>
          `${reminder.text} at ${new Date(reminder.dueAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}`,
      )
      .join(", ");
  },
  (text, ctx) => {
    if (!/(cancel|clear|delete)\s+(?:all\s+)?(?:my\s+)?(reminders|timers)/.test(text)) return null;
    ctx.clearReminders();
    return "All reminders cancelled.";
  },

  // Web
  (text, ctx) => {
    const match = text.match(/^(?:open|launch|go to|take me to)\s+(.+)/);
    if (!match) return null;
    const target = match[1].replace(/\.$/, "").trim();
    const known = SITES[target] ?? SITES[target.replace(/^(the|my)\s+/, "")];
    if (known) {
      ctx.openUrl(known);
      return `Opening ${target}.`;
    }
    if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(target)) {
      ctx.openUrl(`https://${target}`);
      return `Opening ${target}.`;
    }
    ctx.openUrl(`https://www.google.com/search?q=${encodeURIComponent(target)}`);
    return `I could not find an app called ${target}, so I searched the web for it.`;
  },
  (text, ctx) => {
    const match = text.match(/^(?:search|google|look up|find)\s+(?:for\s+)?(.+)/);
    if (!match) return null;
    const query = match[1].trim();
    ctx.openUrl(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
    return `Here are the search results for ${query}.`;
  },
  (text, ctx) => {
    const match = text.match(/^play\s+(.+?)(?:\s+on\s+youtube)?$/);
    if (!match) return null;
    const query = match[1].trim();
    ctx.openUrl(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
    return `Playing ${query} on YouTube.`;
  },

  // Conversions
  (text) => {
    const temperature = text.match(
      /(-?\d+(?:\.\d+)?)\s*(?:degrees\s*)?(celsius|centigrade|c|fahrenheit|f)\b.*?(?:in|to|into)\s*(?:degrees\s*)?(celsius|centigrade|c|fahrenheit|f)\b/,
    );
    if (temperature) {
      const value = Number(temperature[1]);
      const from = temperature[2].startsWith("f") ? "f" : "c";
      const to = temperature[3].startsWith("f") ? "f" : "c";
      if (from === to) return `That is still ${round(value)} degrees.`;
      const converted = from === "c" ? (value * 9) / 5 + 32 : ((value - 32) * 5) / 9;
      return `That is ${round(Math.round(converted * 10) / 10)} degrees ${to === "f" ? "Fahrenheit" : "Celsius"}.`;
    }

    const unit = text.match(/(?:convert\s+)?(\d+(?:\.\d+)?)\s*([a-z]+)\b(?:\s+(?:in|to|into)\s+[a-z]+)?/);
    if (!unit || !/(convert|how many|in |to |into )/.test(text)) return null;
    const conversion = LENGTH_AND_MASS[unit[2]];
    if (!conversion) return null;
    return `That is ${round(Math.round(Number(unit[1]) * conversion.factor * 100) / 100)} ${conversion.to}.`;
  },

  // Countdowns
  (text) => {
    const match = text.match(/how many days (?:until|till|to)\s+(.+)/);
    if (!match) return null;
    const target = match[1].replace(/\.$/, "").trim();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let due: Date | null = null;

    const holiday = HOLIDAYS[target];
    if (holiday) {
      due = new Date(now.getFullYear(), holiday[0], holiday[1]);
      if (due < today) due = new Date(now.getFullYear() + 1, holiday[0], holiday[1]);
    } else {
      const parsed = Date.parse(target);
      if (!Number.isNaN(parsed)) due = new Date(parsed);
    }
    if (!due) return null;

    const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
    if (days === 0) return `${target} is today.`;
    if (days < 0) return `${target} was ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago.`;
    return `${days} day${days === 1 ? "" : "s"} until ${target}.`;
  },

  // Spelling
  (text) => {
    const match = text.match(/^(?:how do you spell|spell)\s+(?:the word\s+)?([a-z]+)/);
    if (!match) return null;
    return `${match[1]} is spelled ${match[1].toUpperCase().split("").join(", ")}.`;
  },

  // Small talk
  (text) => {
    if (/(how are you|how(?:'s| is) it going|what(?:'s| is) up)/.test(text)) {
      return "Running smoothly, thank you. What would you like to do?";
    }
    if (/(good night|goodnight|bye|see you|goodbye)/.test(text)) {
      return "Good night. Tap the orb whenever you need me.";
    }
    if (/(are you (?:a )?(?:real|human|robot|ai))/.test(text)) {
      return "I am software, but I am a good listener.";
    }
    return null;
  },

  // Fun and dice
  (text) => {
    if (!/(flip|toss)\s+(?:a\s+)?coin/.test(text)) return null;
    return `It is ${Math.random() < 0.5 ? "heads" : "tails"}.`;
  },
  (text) => {
    if (!/(roll|throw)\s+(?:a\s+)?(?:dice|die)/.test(text)) return null;
    return `You rolled a ${1 + Math.floor(Math.random() * 6)}.`;
  },
  (text) => {
    const match = text.match(/random number(?:\s+between\s+(\d+)\s+and\s+(\d+))?/);
    if (!match) return null;
    const low = match[1] ? Number(match[1]) : 1;
    const high = match[2] ? Number(match[2]) : 100;
    const [min, max] = low <= high ? [low, high] : [high, low];
    return `Your number is ${min + Math.floor(Math.random() * (max - min + 1))}.`;
  },
  (text) => {
    if (!/(tell me a joke|joke)/.test(text)) return null;
    return JOKES[Math.floor(Math.random() * JOKES.length)];
  },
  (text) => {
    if (!/(thank you|thanks|cheers)/.test(text)) return null;
    return "Any time.";
  },
];

/** Normalises an utterance and runs it through the offline skill list. */
export function runSkills(utterance: string, ctx: SkillContext): SkillResult | null {
  const text = utterance
    .toLowerCase()
    .replace(/[?!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const skill of skills) {
    const reply = skill(text, ctx);
    if (reply) return { text: reply, handled: true };
  }
  return null;
}

const OFFLINE_SUGGESTIONS = [
  "the time or date",
  "maths, like twelve times nine",
  "a note, or read your notes back",
  "a timer or reminder",
  "a conversion, like twenty kilometres in miles",
  "opening a site or searching the web",
];

/** Reply used when no skill matched and no LLM is configured. */
export function fallbackReply(utterance: string): string {
  const suggestion = OFFLINE_SUGGESTIONS[Math.floor(Math.random() * OFFLINE_SUGGESTIONS.length)];
  return `I did not catch a command in "${utterance}". Offline I can handle ${suggestion} — say "what can you do" for the full list. Add an AI key in settings to let me answer anything.`;
}
