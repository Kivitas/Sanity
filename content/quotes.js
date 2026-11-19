/* Sanity: short, kind lines shown on every covered screen. Keep them gentle,
 * never guilt-based. Add new lines at the end; do not attribute quotes to real
 * people unless you are sure of the source. */
(() => {
  'use strict';
  const S = (window.Sanity = window.Sanity || {});
  S.quotes = [
    "It's okay. Sometimes it is okay to miss out while protecting yourself.",
    'A person who walks away from something they want, on their own, has already won a battle nobody else could see.',
    'You are not missing anything that is worth your peace.',
    'Your attention is one of the few things that is entirely yours. Spend it on purpose.',
    'The feed will always have more. Your time does not.',
    'Rest is not a reward you earn by scrolling. It is simply rest.',
    'Boredom is where ideas are born. Give it a few minutes.',
    'Not every urge needs to be obeyed. Notice it, breathe, and let it pass.',
    'You can stay close to people without staying glued to a feed.',
    'Messages are for people. Scrolling is for the algorithm. Choose people.',
    'The best time to put the phone down was five minutes ago. The second best time is now.',
    'Small, quiet choices add up to a calm life.',
    'You are allowed to be unreachable for a while.',
    'Your dopamine is precious. Do not sell it cheap.',
    'Progress is quiet. So is peace.',
    'Look up. The room you are in is real.',
    'Two minutes of stillness can do more for you than two hours of scrolling.',
    'You do not have to see everything to be informed or happy.',
    'Missing a post will never cost you a real moment.',
    'Whatever you are avoiding right now will still be there after a clear, calm break.',
    'Real life is happening outside this screen. Go be part of it.',
    'Most urges pass within a few minutes. You can wait that long.',
    'Your future self is grateful for the attention you protect today.',
    'Good things do not need to be scrolled to be real.',
    'You chose this. That choice is strength, even on the days it feels hard.',
    'Being calm is a skill. Every time you choose it, you practise it.',
    'The quiet you feel right now is worth more than the next video.',
    'You can be curious without being consumed.',
    'Nothing urgent is happening on a feed that cannot wait until you are ready.',
    'Protecting your focus is not missing out. It is choosing where you show up.',
    'Take a slow breath. Let your shoulders drop. You are safe here.',
    'Your mind is not a timeline. You get to decide what fills it.',
    'The people who matter will still be there when you come back to messages.',
    'Be the person who finishes the thing, not the person who scrolled past it.',
    'Easy does it. One small pause can change the whole afternoon.',
    'You are allowed to want something and still choose not to chase it right now.',
    'Walking away from a pull you can feel is a quiet kind of courage.',
    'Enough is a complete feeling. You do not need one more clip to find it.',
    'Your sanity matters more than any single post.',
    'Let the scroll go. Keep the connection.',
    'Attention given freely is a gift. Give it to what you love.',
    'You are doing better than the urge would like you to believe.',
    'Your next good moment might start with closing this tab.',
    'Kindness to yourself counts, even when you are trying to break a habit.',
    'You do not owe the internet your attention.',
  ];
  S.randomQuote = (avoid) => {
    const list = S.quotes;
    if (list.length < 2) return list[0];
    let q;
    do { q = list[Math.floor(Math.random() * list.length)]; } while (q === avoid);
    return q;
  };
})();
