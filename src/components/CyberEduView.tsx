import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { GraduationCap, Lock, CheckCircle2, Sparkles, Trophy, Gamepad2, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Quiz = { q: string; choices: string[]; answer: number; why: string };
type Lesson = {
  id: string;
  title: string;
  emoji: string;
  intro: string;
  points: string[];
  quiz: Quiz;
  unlocksGame?: MiniGameKey;
};
type MiniGameKey = "phish-or-legit" | "password-power" | "link-detective";

const LESSONS: Lesson[] = [
  {
    id: "l1",
    title: "What is a scam?",
    emoji: "🛡️",
    intro: "Scams are tricks bad people use online to steal stuff — like your password, money, or private info.",
    points: [
      "Scammers pretend to be someone you trust (like a game, a friend, or a company).",
      "They try to make you feel scared or excited so you click fast.",
      "If something feels weird — stop and tell a grown-up.",
    ],
    quiz: {
      q: "You get a message: 'You won 1000 Robux! Click here!' What do you do?",
      choices: ["Click right away!", "Stop and tell a grown-up", "Share it with friends"],
      answer: 1,
      why: "Free stuff messages are almost always scams. Grown-ups can help you check.",
    },
  },
  {
    id: "l2",
    title: "Strong passwords",
    emoji: "🔑",
    intro: "A password is like a key to your account. A strong key is hard for bad people to guess.",
    points: [
      "Long is stronger than short. Try 12+ letters.",
      "Mix letters, numbers, and symbols.",
      "Never use your name, birthday, or 'password123'.",
      "Don't share passwords — not even with friends.",
    ],
    quiz: {
      q: "Which password is the strongest?",
      choices: ["cat123", "MyName2015", "Blue!Turtle#Jumps42"],
      answer: 2,
      why: "Longer, mixed, and random-ish is much harder to guess.",
    },
    unlocksGame: "password-power",
  },
  {
    id: "l3",
    title: "Spot phishing emails",
    emoji: "🎣",
    intro: "Phishing is when someone sends a fake email or message to trick you into typing your password.",
    points: [
      "Check who sent it — weird addresses are a red flag.",
      "Watch for scary words like 'URGENT' or 'account will be deleted'.",
      "Never click links in emails you weren't expecting.",
    ],
    quiz: {
      q: "An email says 'Your account will be deleted in 1 hour! Click here NOW.' What is it?",
      choices: ["Real and urgent", "Probably phishing", "A game invite"],
      answer: 1,
      why: "Real companies don't rush you like that. It's a classic phishing trick.",
    },
    unlocksGame: "phish-or-legit",
  },
  {
    id: "l4",
    title: "Safe links vs. sneaky links",
    emoji: "🔗",
    intro: "Links can hide where they really go. A link that says 'google.com' might send you somewhere else!",
    points: [
      "Hover over a link to see the real address (ask a grown-up to help).",
      "Watch for tiny changes: g00gle.com, arnazon.com, paypa1.com.",
      "'https://' with a lock is safer than 'http://'.",
    ],
    quiz: {
      q: "Which link looks the most suspicious?",
      choices: ["https://google.com", "http://g00gle-login.win", "https://school.edu"],
      answer: 1,
      why: "Weird spelling and 'http' (no s) is a big warning sign.",
    },
    unlocksGame: "link-detective",
  },
  {
    id: "l5",
    title: "Personal info superpowers",
    emoji: "🦸",
    intro: "Some info is private — your full name, address, school, phone number, and birthday.",
    points: [
      "Never share personal info with strangers online.",
      "Games and quizzes that ask lots of questions can be traps.",
      "If someone online asks to meet, tell a grown-up right away.",
    ],
    quiz: {
      q: "A stranger in a game asks 'What school do you go to?' What do you do?",
      choices: ["Tell them", "Ignore and tell a grown-up", "Ask them theirs first"],
      answer: 1,
      why: "Real friends don't need private info. Always tell a grown-up.",
    },
  },
  {
    id: "l6",
    title: "What is a hacker?",
    emoji: "💻",
    intro: "A hacker tries to sneak into computers or accounts. Not all hackers are bad — some help protect us!",
    points: [
      "Bad hackers steal info or break things.",
      "Good hackers ('white hat') find problems so they can be fixed.",
      "Updates on your device close hacker doors — say yes to updates!",
    ],
    quiz: {
      q: "Your device asks to install an update. What's the best choice?",
      choices: ["Ignore forever", "Install it (or ask a grown-up)", "Turn off the wifi"],
      answer: 1,
      why: "Updates fix holes that hackers use. Installing them keeps you safer.",
    },
  },
  {
    id: "l7",
    title: "Public wifi warnings",
    emoji: "📶",
    intro: "Public wifi at cafes, airports, or hotels can be risky. Others on the same wifi might peek at what you do.",
    points: [
      "Don't type passwords or buy things on public wifi.",
      "Use your home wifi or your phone data for important stuff.",
      "A VPN adds a secret tunnel — Trust Shield tells grown-ups about that.",
    ],
    quiz: {
      q: "You're at a cafe with free wifi. What's safe to do?",
      choices: ["Log into your bank", "Watch a video", "Type your password everywhere"],
      answer: 1,
      why: "Watching or reading is fine. Save passwords and money stuff for home.",
    },
  },
  {
    id: "l8",
    title: "When something feels off",
    emoji: "🚨",
    intro: "The most important skill in cybersecurity is trusting your gut. Weird = stop.",
    points: [
      "If a message is too good to be true, it is.",
      "If a website asks for stuff it shouldn't need, leave.",
      "Always, always tell a grown-up — you won't get in trouble for being careful.",
    ],
    quiz: {
      q: "The #1 rule when something online feels wrong?",
      choices: ["Keep clicking to see what happens", "Tell a grown-up", "Delete your account"],
      answer: 1,
      why: "Grown-ups can help figure out what's real. You're a team!",
    },
  },
];

export default function CyberEduView({ userId }: { userId?: string }) {
  const storageKey = useMemo(() => `ts_cyberedu_${userId ?? "anon"}`, [userId]);
  const [progress, setProgress] = useState<{ completed: string[]; xp: number; games: MiniGameKey[] }>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return { completed: [], xp: 0, games: [] };
  });
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [activeGame, setActiveGame] = useState<MiniGameKey | null>(null);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(progress));
  }, [progress, storageKey]);

  const isCompleted = (id: string) => progress.completed.includes(id);
  const isUnlocked = (idx: number) => idx === 0 || isCompleted(LESSONS[idx - 1].id);

  const completeLesson = (lesson: Lesson) => {
    setProgress((p) => {
      if (p.completed.includes(lesson.id)) return p;
      const games = lesson.unlocksGame && !p.games.includes(lesson.unlocksGame)
        ? [...p.games, lesson.unlocksGame]
        : p.games;
      return { completed: [...p.completed, lesson.id], xp: p.xp + 25, games };
    });
    toast.success(`Lesson complete! +25 XP`, {
      description: lesson.unlocksGame ? `You unlocked a mini-game: ${gameName(lesson.unlocksGame)}!` : "Next lesson unlocked.",
    });
    setActiveLesson(null);
  };

  const resetProgress = () => {
    setProgress({ completed: [], xp: 0, games: [] });
    toast("Progress reset");
  };

  const totalLessons = LESSONS.length;
  const doneCount = progress.completed.length;
  const pct = Math.round((doneCount / totalLessons) * 100);

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">CyberEdu</h2>
            <p className="text-sm text-muted-foreground">
              Learn to spot scams, hackers, and sneaky links. Finish lessons to earn XP and unlock mini-games!
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={resetProgress} title="Reset progress">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="Lessons" value={`${doneCount} / ${totalLessons}`} icon={<GraduationCap className="w-4 h-4" />} />
          <Stat label="XP earned" value={String(progress.xp)} icon={<Sparkles className="w-4 h-4" />} />
          <Stat label="Games unlocked" value={String(progress.games.length)} icon={<Gamepad2 className="w-4 h-4" />} />
        </div>
        <div className="mt-3">
          <div className="h-2 rounded-full bg-secondary/60 overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">{pct}% of CyberEdu complete</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-primary" />
          Lessons
        </h3>
        <ul className="space-y-2">
          {LESSONS.map((lesson, idx) => {
            const done = isCompleted(lesson.id);
            const unlocked = isUnlocked(idx);
            return (
              <li
                key={lesson.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition ${
                  done
                    ? "bg-primary/5 border-primary/30"
                    : unlocked
                      ? "bg-secondary/40 border-border hover:border-primary/40"
                      : "bg-secondary/20 border-border opacity-60"
                }`}
              >
                <div className="w-9 h-9 rounded-lg bg-background flex items-center justify-center text-lg">
                  {unlocked ? lesson.emoji : <Lock className="w-4 h-4 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <span className="text-muted-foreground">#{idx + 1}</span>
                    <span className="truncate">{lesson.title}</span>
                    {done && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{lesson.intro}</div>
                </div>
                <Button
                  size="sm"
                  variant={done ? "outline" : "default"}
                  disabled={!unlocked}
                  onClick={() => setActiveLesson(lesson)}
                >
                  {done ? "Replay" : unlocked ? "Start" : "Locked"}
                  {unlocked && <ArrowRight className="w-3.5 h-3.5 ml-1" />}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Gamepad2 className="w-4 h-4 text-primary" />
          Mini-games
        </h3>
        {progress.games.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No games yet! Finish lessons like "Strong passwords" or "Spot phishing emails" to unlock mini-games.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {progress.games.map((g) => (
              <button
                key={g}
                onClick={() => setActiveGame(g)}
                className="text-left p-3 rounded-lg bg-secondary/40 border border-border hover:border-primary/40 transition"
              >
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">{gameName(g)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{gameBlurb(g)}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {activeLesson && (
        <LessonModal
          lesson={activeLesson}
          onClose={() => setActiveLesson(null)}
          onComplete={() => completeLesson(activeLesson)}
        />
      )}
      {activeGame && <MiniGameModal game={activeGame} onClose={() => setActiveGame(null)} onEarnXp={(n) => setProgress((p) => ({ ...p, xp: p.xp + n }))} />}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="p-3 rounded-lg bg-secondary/40 border border-border">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{icon}{label}</div>
      <div className="text-lg font-bold mt-0.5">{value}</div>
    </div>
  );
}

function gameName(g: MiniGameKey) {
  return g === "phish-or-legit" ? "Phish or Legit" : g === "password-power" ? "Password Power" : "Link Detective";
}
function gameBlurb(g: MiniGameKey) {
  return g === "phish-or-legit"
    ? "Swipe fake vs. real emails."
    : g === "password-power"
      ? "Rank passwords from weak to strong."
      : "Spot the sneaky URL.";
}

function LessonModal({ lesson, onClose, onComplete }: { lesson: Lesson; onClose: () => void; onComplete: () => void }) {
  const [step, setStep] = useState<"read" | "quiz" | "done">("read");
  const [choice, setChoice] = useState<number | null>(null);
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-5 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-3">
          <div className="text-3xl">{lesson.emoji}</div>
          <div>
            <h3 className="text-lg font-bold">{lesson.title}</h3>
            <div className="text-xs text-muted-foreground">
              {step === "read" ? "Read up" : step === "quiz" ? "Quick quiz" : "Nice work!"}
            </div>
          </div>
        </div>
        {step === "read" && (
          <>
            <p className="text-sm">{lesson.intro}</p>
            <ul className="mt-3 space-y-2">
              {lesson.points.map((p, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-primary">•</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button onClick={() => setStep("quiz")}>
                Take the quiz <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </>
        )}
        {step === "quiz" && (
          <>
            <p className="text-sm font-semibold">{lesson.quiz.q}</p>
            <div className="mt-3 space-y-2">
              {lesson.quiz.choices.map((c, i) => (
                <button
                  key={i}
                  onClick={() => setChoice(i)}
                  className={`w-full text-left p-3 rounded-lg border text-sm transition ${
                    choice === null
                      ? "bg-secondary/40 border-border hover:border-primary/40"
                      : i === lesson.quiz.answer
                        ? "bg-primary/10 border-primary"
                        : i === choice
                          ? "bg-destructive/10 border-destructive"
                          : "bg-secondary/40 border-border opacity-70"
                  }`}
                  disabled={choice !== null}
                >
                  {c}
                </button>
              ))}
            </div>
            {choice !== null && (
              <div className="mt-3 p-3 rounded-lg bg-secondary/40 border border-border text-sm">
                {choice === lesson.quiz.answer ? "✅ Correct! " : "❌ Not quite. "}
                {lesson.quiz.why}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setChoice(null); setStep("read"); }}>Back</Button>
              <Button onClick={onComplete} disabled={choice === null}>
                Finish lesson
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MiniGameModal({ game, onClose, onEarnXp }: { game: MiniGameKey; onClose: () => void; onEarnXp: (n: number) => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-5 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <Gamepad2 className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold">{gameName(game)}</h3>
        </div>
        {game === "phish-or-legit" && <PhishOrLegit onEarnXp={onEarnXp} onClose={onClose} />}
        {game === "password-power" && <PasswordPower onEarnXp={onEarnXp} onClose={onClose} />}
        {game === "link-detective" && <LinkDetective onEarnXp={onEarnXp} onClose={onClose} />}
      </div>
    </div>
  );
}

type GameProps = { onEarnXp: (n: number) => void; onClose: () => void };

function PhishOrLegit({ onEarnXp, onClose }: GameProps) {
  const items = useMemo(
    () => [
      { text: "Your teacher sends a Google Classroom invite from their school email.", phish: false },
      { text: "'URGENT: Your Roblox account will be BANNED! Click here to verify.'", phish: true },
      { text: "Netflix asks you to log in — but the URL is netfl1x-billing.win", phish: true },
      { text: "Your mom emails you a photo from the family trip.", phish: false },
      { text: "'You've been chosen for a $500 gift card. Send us your address.'", phish: true },
      { text: "Your school posts assignments on the school website you always use.", phish: false },
    ],
    [],
  );
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (i >= items.length) {
    return <GameEnd score={score} total={items.length} onClose={onClose} onEarnXp={onEarnXp} />;
  }
  const answer = (phishGuess: boolean) => {
    const correct = phishGuess === items[i].phish;
    setFeedback(correct ? "✅ Nice catch!" : `❌ It was ${items[i].phish ? "phishing" : "legit"}.`);
    if (correct) setScore((s) => s + 1);
    setTimeout(() => {
      setFeedback(null);
      setI((n) => n + 1);
    }, 900);
  };
  return (
    <>
      <div className="text-xs text-muted-foreground mb-2">Question {i + 1} of {items.length} · Score: {score}</div>
      <div className="p-4 rounded-lg bg-secondary/40 border border-border text-sm">{items[i].text}</div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => answer(false)} disabled={!!feedback}>👍 Legit</Button>
        <Button variant="destructive" onClick={() => answer(true)} disabled={!!feedback}>🎣 Phish</Button>
      </div>
      {feedback && <div className="mt-3 text-sm text-center">{feedback}</div>}
    </>
  );
}

function PasswordPower({ onEarnXp, onClose }: GameProps) {
  const rounds = useMemo(
    () => [
      { pair: ["cat", "T5%rain!Snowfl@ke"], strongIdx: 1 },
      { pair: ["Password123", "gL9!oomy-Cactus-River"], strongIdx: 1 },
      { pair: ["My!Very4Long$Secret", "12345678"], strongIdx: 0 },
      { pair: ["hunter2", "K@ngaroo-Waffle#Jet-77"], strongIdx: 1 },
    ],
    [],
  );
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  if (i >= rounds.length) return <GameEnd score={score} total={rounds.length} onClose={onClose} onEarnXp={onEarnXp} />;
  const pick = (idx: number) => {
    const ok = idx === rounds[i].strongIdx;
    setFeedback(ok ? "✅ Correct — that one's way harder to crack!" : "❌ Nope, the other one is stronger.");
    if (ok) setScore((s) => s + 1);
    setTimeout(() => {
      setFeedback(null);
      setI((n) => n + 1);
    }, 900);
  };
  return (
    <>
      <div className="text-xs text-muted-foreground mb-2">Round {i + 1} of {rounds.length} · Score: {score}</div>
      <div className="text-sm mb-2">Which password is stronger?</div>
      <div className="grid grid-cols-1 gap-2">
        {rounds[i].pair.map((p, idx) => (
          <button
            key={idx}
            onClick={() => pick(idx)}
            disabled={!!feedback}
            className="p-3 rounded-lg bg-secondary/40 border border-border hover:border-primary/40 text-sm font-mono text-left break-all"
          >
            {p}
          </button>
        ))}
      </div>
      {feedback && <div className="mt-3 text-sm text-center">{feedback}</div>}
    </>
  );
}

function LinkDetective({ onEarnXp, onClose }: GameProps) {
  const rounds = useMemo(
    () => [
      { links: ["https://google.com", "http://g00gle-verify.win"], badIdx: 1 },
      { links: ["https://roblox-free-robux.pro", "https://www.roblox.com"], badIdx: 0 },
      { links: ["https://amazon.com", "https://arnazon-support.help"], badIdx: 1 },
      { links: ["http://paypa1-login-secure.top", "https://www.paypal.com"], badIdx: 0 },
    ],
    [],
  );
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  if (i >= rounds.length) return <GameEnd score={score} total={rounds.length} onClose={onClose} onEarnXp={onEarnXp} />;
  const pick = (idx: number) => {
    const ok = idx === rounds[i].badIdx;
    setFeedback(ok ? "✅ Detective work! That URL is sneaky." : "❌ The other one is the fake.");
    if (ok) setScore((s) => s + 1);
    setTimeout(() => {
      setFeedback(null);
      setI((n) => n + 1);
    }, 900);
  };
  return (
    <>
      <div className="text-xs text-muted-foreground mb-2">Case {i + 1} of {rounds.length} · Score: {score}</div>
      <div className="text-sm mb-2">Which link is the sneaky one?</div>
      <div className="grid grid-cols-1 gap-2">
        {rounds[i].links.map((l, idx) => (
          <button
            key={idx}
            onClick={() => pick(idx)}
            disabled={!!feedback}
            className="p-3 rounded-lg bg-secondary/40 border border-border hover:border-primary/40 text-sm font-mono text-left break-all"
          >
            {l}
          </button>
        ))}
      </div>
      {feedback && <div className="mt-3 text-sm text-center">{feedback}</div>}
    </>
  );
}

function GameEnd({ score, total, onClose, onEarnXp }: { score: number; total: number; onClose: () => void; onEarnXp: (n: number) => void }) {
  const [claimed, setClaimed] = useState(false);
  const xp = score * 10;
  return (
    <div className="text-center py-4">
      <Trophy className="w-12 h-12 text-primary mx-auto" />
      <div className="text-lg font-bold mt-2">You scored {score} / {total}!</div>
      <div className="text-sm text-muted-foreground">Earn {xp} XP for this run.</div>
      <div className="mt-4 flex justify-center gap-2">
        <Button
          onClick={() => {
            if (!claimed) {
              onEarnXp(xp);
              setClaimed(true);
              toast.success(`+${xp} XP earned!`);
            }
          }}
          disabled={claimed || xp === 0}
        >
          {claimed ? "Claimed" : "Claim XP"}
        </Button>
        <Button variant="outline" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}