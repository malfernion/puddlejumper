// Dialogue trees. Each node is a function of the game API `g` returning { text, choices }.
// Choice: { label, cost?, cond?, fx?(g), goto?, act? ('close' | 'shop') }.

const leave = (label = 'Cast off') => ({ label, act: 'close' });

export const ENCOUNTERS = {
  barnacle: {
    name: 'Harbourmaster Pim', place: 'Barnacle Bay, Puddle', portrait: '🦦', color: '#ffb347',
    shop: ['twin', 'wings', 'kettle', 'search'], repair: 0,
    start: (g) => (g.flag('met_pim') ? 'hub' : 'intro'),
    nodes: {
      intro: (g) => ({
        text: `An otter in an enormous captain's hat waves a fish at you.\n\n"Ahoy, new pilot! Welcome to <em>Barnacle Bay</em>. That's a fine little tin can you've got there. Mostly watertight, I'd say."\n\n"I'll be straight with you: the old <em>beacons</em> on the five worlds have gone dark. Without them nobody can find their way between the seas, and something big and grumpy has moved into the dark."`,
        choices: [{ label: '"What can I do?"', goto: 'intro2' }],
      }),
      intro2: (g) => ({
        text: `"Light 'em! Our own beacon's on <em>Lamp Rock</em>, the tall island round the back of Puddle. You'll have to <em>leap</em> to reach it: swim fast at the surface and up you go, like a dolphin with ambitions."\n\n"Here, take this old chart. Two more worlds hang in the sky nearby: <em>Murkmoor</em> and <em>Frostfloe</em>. To reach 'em you'll need a rocket that can climb out of Puddle's pull. The Fizz Bottle won't. A <em>Kettle Rocket</em> will."`,
        choices: [{ label: 'Take the chart', fx: (g) => { g.setFlag('met_pim'); g.reveal('murk'); g.reveal('frost'); g.toast('Chart updated: Murkmoor and Frostfloe', 'good'); }, goto: 'hub' }],
      }),
      hub: (g) => ({
        text: g.beacons() >= 5
          ? `Pim is dancing on the quay. "Every light in the sky is burning! You did it, captain!"`
          : `"Back again! The quay's yours. Repairs and refills are on the house for a Puddle pilot."${g.hullPct() < 1 ? '\n\nPim eyes your dents and tuts.' : ''}`,
        choices: [
          { label: 'Visit the Drydock', act: 'shop' },
          { label: 'Patch the hull & top up the fizz (free)', cond: (g) => g.hullPct() < 1, fx: (g) => { g.repair(); g.toast('Hull patched!', 'good'); }, goto: 'hub' },
          { label: 'Ask for rumours', goto: 'rumour' },
          leave(),
        ],
      }),
      rumour: (g) => {
        const r = [];
        if (!g.lit('puddle')) r.push('"Lamp Rock\'s the tall island on the far side. Build up speed underwater and leap. Gull Wings make a leap go a long way."');
        if (!g.owned('rocket', 'kettle')) r.push('"Kettle Rocket costs 80 pearls. Pearls glitter all over the seabed, and there are a few lost crates too."');
        r.push('"There\'s a crab who lives in a bottle at the bottom of Puddle. Calls himself <em>Sir Corkington</em>. Don\'t gamble with him. Or do! I\'m not your mother."');
        r.push('"The deep trench is too deep for a tin can. Pressure\'ll crumple you like a paper hat. The penguins of Frostfloe sell a proper <em>Bathysphere</em>."');
        r.push('"Old Hum the whale circles Puddle. Swim in her wake and you\'ll fly along. She likes a chat if you\'re polite."');
        if (g.beacons() >= 4 && !g.lit('maw')) r.push('"Four lights burning… the storm round <em>The Maw</em> must be lifting. Whatever lives in the dark is waiting for you there."');
        return { text: r[Math.floor(Math.random() * r.length)], choices: [{ label: 'Another?', goto: 'rumour' }, { label: 'Back', goto: 'hub' }] };
      },
    },
  },

  hermit: {
    name: 'Sir Corkington', place: 'a bottle on the seabed, Puddle', portrait: '🦀', color: '#ff7b5a',
    start: () => 'hub',
    nodes: {
      hub: (g) => ({
        text: `A crab in a tiny top hat peers out of a green bottle.\n\n"Psst. You there. Yes, you, the floating sardine tin. Care for a little <em>game of chance</em>? Gimme 20 pearls, I give the shells a shuffle, and you might walk away with <em>double</em>. Or not! That's the thrill."`,
        choices: [
          { label: 'Play the shell game', cost: 20, fx: (g) => { if (Math.random() < 0.45) { g.give(40); g.memo('win'); } else g.memo('lose'); }, goto: 'result' },
          { label: '"Know anything useful?"', cost: 5, goto: 'secret' },
          leave('Back away slowly'),
        ],
      }),
      result: (g) => ({
        text: g.memo() === 'win'
          ? '"Well, barnacles. You found it. Take your pearls and stop looking so smug."'
          : '"Ooooh, so close! The pearl was under the <em>other</em> shell. It\'s always under the other shell."',
        choices: [{ label: 'Again!', cost: 20, fx: (g) => { if (Math.random() < 0.45) { g.give(40); g.memo('win'); } else g.memo('lose'); }, goto: 'result' }, { label: 'Enough', goto: 'hub' }],
      }),
      secret: (g) => ({
        text: '"There\'s a <em>crate</em> at the very bottom of the trench, right under the old angler\'s nose. Douse your lamp down there, sardine. Anglers only bite what they can see."',
        choices: [{ label: 'Back', goto: 'hub' }],
      }),
    },
  },

  hum: {
    name: 'Old Hum', place: 'the open water, Puddle', portrait: '🐋', color: '#5a8ad8',
    start: (g) => (g.flag('met_hum') ? 'again' : 'first'),
    nodes: {
      first: (g) => ({
        text: 'The whale turns one vast, kind eye toward you. The water vibrates with a note too low to hear.\n\n<em>"Little shell. You swim like you mean it. The lights went out when the deep one got lonely. Find the fire-world, where the water boils. Its beacon sleeps in a hole even I won\'t dive."</em>',
        choices: [{ label: 'Hum back, politely', fx: (g) => { g.setFlag('met_hum'); g.reveal('ember'); g.give(20); g.toast('Chart updated: Emberbrine. Old Hum gives you 20 pearls she found.', 'good'); }, act: 'close' }],
      }),
      again: () => ({
        text: '<em>"Ride my wake, little shell."</em> The whale hums a long chord, and your hull rings with it.',
        choices: [leave('Swim on')],
      }),
    },
  },

  gloomwharf: {
    name: 'Inkwell Ida', place: 'Gloomwharf, Murkmoor', portrait: '🐙', color: '#7b5aa8',
    shop: ['ray', 'comet'], repair: 1,
    start: () => 'hub',
    nodes: {
      hub: (g) => ({
        text: g.flag('ida_crate') && !g.flag('crate_done')
          ? '"Well? Is my crate in a nice warm igloo yet? Pengwyn Point, sugar. Frostfloe. Go!"'
          : `An octopus with eight different hats looks up from counting pearls.\n\n"Welcome to Gloomwharf, darling, where nobody asks and everybody tells. Repairs cost <em>1 pearl a dent</em>. We aren't a charity."`,
        choices: [
          { label: 'Browse the back room', act: 'shop' },
          { label: 'Repair the hull', cond: (g) => g.hullPct() < 1, fx: (g) => g.paidRepair(1), goto: 'hub' },
          { label: '"Got any work?"', cond: (g) => !g.flag('ida_crate'), goto: 'job' },
          { label: 'Collect your Comet Booster', cond: (g) => g.flag('crate_done') && !g.flag('ida_paid'), goto: 'paid' },
          leave(),
        ],
      }),
      job: () => ({
        text: '"Funny you should ask." She slides over a crate. It is <em>ticking</em>.\n\n"Deliver this to Captain Flipwell at Pengwyn Point on Frostfloe. Don\'t open it, don\'t shake it, don\'t sing to it. Do that and the <em>Comet Booster</em> is yours. Free."',
        choices: [
          { label: 'Take the ticking crate', fx: (g) => { g.setFlag('ida_crate'); g.toast('Got: a suspiciously ticking crate', 'good'); }, goto: 'hub' },
          { label: '"…It\'s ticking."', goto: 'ticking' },
        ],
      }),
      ticking: () => ({
        text: '"Lots of things tick, darling. Clocks. Crickets. Hearts." She smiles with far too many suckers.',
        choices: [{ label: 'Take it anyway', fx: (g) => { g.setFlag('ida_crate'); g.toast('Got: a suspiciously ticking crate', 'good'); }, goto: 'hub' }, leave('Absolutely not')],
      }),
      paid: () => ({
        text: '"Flipwell sent word. Not a scratch on it! You\'re a natural smuggler, sugar." She tosses you a gleaming rocket.\n\n"Comet Booster. Mind the eyebrows."',
        choices: [{ label: 'Bolt it on', fx: (g) => { g.setFlag('ida_paid'); g.grant('rocket', 'comet'); g.toast('Got: Comet Booster (equip it in a Drydock)', 'good'); }, goto: 'hub' }],
      }),
    },
  },

  ooze: {
    name: 'Madame Ooze', place: 'the Grotto of Whispers, Murkmoor', portrait: '🐌', color: '#b06bff',
    start: () => 'hub',
    nodes: {
      hub: (g) => ({
        text: 'A sea slug in a shawl sways among guttering candles. Her eyestalks swivel toward you independently.\n\n"I seeeee you, little vessel. I see where you\'ve been. I see where you have <em>not</em>."',
        choices: [
          { label: 'Have your fortune told', cost: 15, goto: 'fortune' },
          { label: 'Buy a Glowcap Lantern', cost: 60, cond: (g) => !g.owned('lamp', 'glowcap'), fx: (g) => { g.grant('lamp', 'glowcap'); g.toast('Got: Glowcap Lantern. Anglers won\'t notice it.', 'good'); }, goto: 'hub' },
          leave('Leave the grotto'),
        ],
      }),
      fortune: (g) => {
        let t;
        if (!g.known('ember')) { g.reveal('ember'); t = 'Her eyes roll back. "Fire… a world of <em>boiling springs</em>, far below Puddle in the sky. The water there will throw you to the stars." Emberbrine appears on your chart.'; }
        else if (!g.known('maw')) { g.reveal('maw'); t = '"Darkness… a great dark world, beyond the ice. Something there is very, very <em>afraid</em>." The Maw appears on your chart.'; }
        else t = ['"You will meet a tall, dark stranger. It will have eight arms. Bring a light."', '"Lucky number: seven. Lucky colour: wet."', '"The fourth light opens the fifth door."'][Math.floor(Math.random() * 3)];
        return { text: t, choices: [{ label: 'Back', goto: 'hub' }] };
      },
    },
  },

  pengwyn: {
    name: 'Captain Flipwell', place: 'Pengwyn Point, Frostfloe', portrait: '🐧', color: '#5ec8ff',
    shop: ['bathy', 'flukes'], repair: 0,
    start: () => 'hub',
    nodes: {
      hub: (g) => ({
        text: `A penguin in a tiny lifejacket salutes smartly.\n\n"Pengwyn Point welcomes you! Mind the ice: it's thick, and the holes move about when nobody's looking. Repairs are free for anyone brave enough to visit."`,
        choices: [
          { label: 'Visit the Drydock', act: 'shop' },
          { label: 'Patch the hull (free)', cond: (g) => g.hullPct() < 1, fx: (g) => { g.repair(); g.toast('Hull patched!', 'good'); }, goto: 'hub' },
          { label: 'Deliver Ida\'s ticking crate', cond: (g) => g.flag('ida_crate') && !g.flag('crate_done'), goto: 'crate' },
          { label: '"Seen anything strange?"', goto: 'rumour' },
          leave(),
        ],
      }),
      crate: () => ({
        text: 'Flipwell pries the lid off. Inside: an egg timer, ringing merrily, and a <em>very large cake</em> with "HAPPY HATCHDAY FLIPPY" piped on it in fish paste.\n\n"Oh, that Ida! Every year!" The penguin wipes away a tear. "Tell her thank you. And have a slice."',
        choices: [{ label: 'Eat cake', fx: (g) => { g.setFlag('crate_done'); g.repair(); g.toast('Delivered! Ida will be pleased. Hull repaired by cake.', 'good'); }, goto: 'hub' }],
      }),
      rumour: (g) => ({
        text: g.lit('frost')
          ? '"Our beacon burns again! Prof. Tusk swam a lap of honour."'
          : '"Our beacon\'s underneath the big ice sheet, past the second hole. You\'ll have to dive under and find it in the cold dark. Prof. Tusk knows the way, if you can keep up with him."',
        choices: [{ label: 'Back', goto: 'hub' }],
      }),
    },
  },

  tusk: {
    name: 'Prof. Tusk', place: 'under the ice, Frostfloe', portrait: '🦄', color: '#9fb0c6',
    start: (g) => (g.flag('met_tusk') ? 'again' : 'first'),
    nodes: {
      first: () => ({
        text: 'A narwhal in half-moon spectacles circles you, interested.\n\n"Remarkable! A submersible! You know, the five beacons were lit to keep the dark one company. Its world is <em>The Maw</em>, out past us. When the lights went out it got frightened, and frightened things bite."',
        choices: [{ label: '"Where is The Maw?"', fx: (g) => { g.setFlag('met_tusk'); g.reveal('maw'); g.toast('Chart updated: The Maw', 'good'); }, goto: 'where' }],
      }),
      where: () => ({
        text: '"Beyond the ice, up and away. You\'ll need the four other beacons lit before its storm lets you in. And a strong rocket. And, I suspect, courage."',
        choices: [leave('Thank the professor')],
      }),
      again: () => ({ text: '"Onward, onward! Science waits for no narwhal!"', choices: [leave('Swim on')] }),
    },
  },

  cinder: {
    name: 'Mr. Sizzle', place: 'Cinder Spa, Emberbrine', portrait: '🐍', color: '#ff7b3d',
    shop: ['jet'], repair: 2,
    start: () => 'hub',
    nodes: {
      hub: (g) => ({
        text: `A long orange eel in a fluffy towel lounges in the hot tub.\n\n"Welcome, welcome to <em>Cinder Spa</em>. Hot springs, cold drinks, and absolutely no biting… on the premises. A full <em>steam treatment</em> fixes any hull: 30 pearls. Or 2 pearls a dent, if you're a cheapskate."`,
        choices: [
          { label: 'Browse the gift shop', act: 'shop' },
          { label: 'The Steam Treatment', cost: 30, cond: (g) => g.hullPct() < 1, fx: (g) => { g.repair(); g.toast('Ahhh. Good as new.', 'good'); }, goto: 'steam' },
          { label: 'Repair by the dent', cond: (g) => g.hullPct() < 1, fx: (g) => g.paidRepair(2), goto: 'hub' },
          { label: '"Where\'s your beacon?"', goto: 'beacon' },
          leave(),
        ],
      }),
      steam: () => ({ text: 'You emerge pink, polished and gleaming. Mr. Sizzle hands you a mint.', choices: [{ label: 'Back', goto: 'hub' }] }),
      beacon: (g) => ({
        text: '"Bottom of the <em>Boiling Hole</em>. Very deep. Very anglery. You want an iron hull for that, sssweetie, and a quiet light."\n\n"Oh, and my geysers will throw you to the moon if you sit on them. Our guests love it."',
        choices: [{ label: 'Back', goto: 'hub' }],
      }),
    },
  },

  beacon: {
    name: 'The Beacon', place: '', portrait: '🗼', color: '#ffe27a',
    start: (g) => (g.lit(g.here()) ? 'lit' : 'dark'),
    nodes: {
      dark: (g) => ({
        text: 'The old beacon stands cold, its great glass bulb grey with silt. A brass lever juts from its side, green with age.',
        choices: [{ label: 'Haul on the lever', fx: (g) => g.lightBeacon(), act: 'close' }, leave('Leave it dark')],
      }),
      lit: () => ({ text: 'The beacon blazes, sweeping its beam across the sky.', choices: [leave('Admire it')] }),
    },
  },

  kraken: {
    name: 'The Deep One', place: 'the bottom of The Maw', portrait: '🦑', color: '#b06bff',
    start: () => 'end',
    nodes: {
      end: () => ({
        text: 'The last beacon roars alight. Its beam sweeps across the dark sea…\n\n…and the great kraken stops thrashing. Its enormous eyes fill with light. Slowly, shyly, one tentacle reaches out and pats your hull.\n\nIt was never angry. It was just <em>afraid of the dark</em>.\n\nAcross the sky, five beacons burn, and every sailor in every sea can find their way home.',
        choices: [{ label: 'Pat it back', fx: (g) => g.win(), act: 'close' }],
      }),
    },
  },
};
