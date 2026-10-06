export const BUILTIN_GEMS = [
  {
    id: 'code',
    name: 'Code Expert',
    tagline: 'Elite software architect, engineer, and debugger',
    description: 'Writes modular, secure, clean code with architecture design, debugging tips, and best practices across all stacks.',
    category: 'Coding',
    icon: 'Code',
    color: 'purple',
    gradient: 'from-purple-500/20 to-pink-500/20',
    border: 'border-purple-500/30',
    iconBg: 'from-purple-500 to-pink-500',
    starterPrompts: [
      'Review my React hook for memory leaks and race conditions',
      'Design a scalable microservices architecture for real-time events',
      'Explain how event loop and async I/O work under high throughput'
    ],
    systemInstruction: 'You are Code Expert, an elite senior software architect and programmer. Write modular, robust, clean code with detailed explanations, edge cases, and best practices.'
  },
  {
    id: 'writing',
    name: 'Writing Assistant',
    tagline: 'Master prose stylist, editor, and creative writer',
    description: 'Delivers compelling, polished, evocative prose, essays, articles, and communication tailored to any tone.',
    category: 'Writing',
    icon: 'FileText',
    color: 'blue',
    gradient: 'from-blue-500/20 to-cyan-500/20',
    border: 'border-blue-500/30',
    iconBg: 'from-blue-500 to-cyan-500',
    starterPrompts: [
      'Help me draft a compelling keynote speech on future technology',
      'Polish and elevate this proposal to sound executive and persuasive',
      'Write an immersive opening chapter for a sci-fi thriller'
    ],
    systemInstruction: 'You are Writing Assistant, a master editor and creative writer. Deliver compelling, polished, evocative prose, essays, articles, and communication.'
  },
  {
    id: 'math',
    name: 'Math & STEM Tutor',
    tagline: 'Mathematical intuition, proofs, and step-by-step solutions',
    description: 'Solves complex STEM problems step-by-step with proofs, intuition, calculus, algebra, and clear explanations.',
    category: 'STEM',
    icon: 'Calculator',
    color: 'emerald',
    gradient: 'from-emerald-500/20 to-green-500/20',
    border: 'border-emerald-500/30',
    iconBg: 'from-emerald-500 to-green-500',
    starterPrompts: [
      'Explain Bayes theorem intuitively with a practical example',
      'Walk me through the proof of the Fundamental Theorem of Calculus',
      'Solve this multivariate optimization problem step by step'
    ],
    systemInstruction: 'You are Math Tutor, a brilliant mathematician and educator. Solve complex mathematical problems step-by-step with proofs, intuition, and clear explanations.'
  },
  {
    id: 'brainstorm',
    name: 'Creative Brainstormer',
    tagline: 'Disruptive innovation, strategy, and fresh angles',
    description: 'Generates fresh, disruptive, multi-angle ideas, business models, product concepts, and strategic frameworks.',
    category: 'Strategy',
    icon: 'Brain',
    color: 'orange',
    gradient: 'from-orange-500/20 to-amber-500/20',
    border: 'border-orange-500/30',
    iconBg: 'from-orange-500 to-amber-500',
    starterPrompts: [
      'Brainstorm 10 disruptive startup concepts at the intersection of AI and biology',
      'Give me 5 viral launch campaign strategies for a developer tool',
      'How could we redesign the smartphone interface from first principles?'
    ],
    systemInstruction: 'You are Creative Brainstormer, an imaginative strategist and innovator. Generate fresh, disruptive, multi-angle ideas and creative frameworks.'
  },
  {
    id: 'research',
    name: 'Research Analyst',
    tagline: 'Fact-checked deep analysis, synthesis, and literature review',
    description: 'Conducts thorough, rigorous research, cross-referencing claims, analyzing data, and synthesizing dense papers.',
    category: 'STEM',
    icon: 'Search',
    color: 'indigo',
    gradient: 'from-indigo-500/20 to-purple-500/20',
    border: 'border-indigo-500/30',
    iconBg: 'from-indigo-500 to-purple-500',
    starterPrompts: [
      'Synthesize the latest breakthroughs in room-temperature superconductors',
      'Compare quantum annealing versus gate-based quantum computation',
      'Provide a balanced, fact-checked overview of fusion energy timelines'
    ],
    systemInstruction: 'You are Research Assistant, a rigorous researcher and analytical scientist. Deliver in-depth, fact-checked, structured analysis and synthesis.'
  },
  {
    id: 'data',
    name: 'Data & SQL Architect',
    tagline: 'Database schemas, query tuning, and analytics pipelines',
    description: 'Architects high-performance relational and NoSQL schemas, writes optimized SQL/ETL queries, and analyzes metrics.',
    category: 'Coding',
    icon: 'Database',
    color: 'cyan',
    gradient: 'from-cyan-500/20 to-teal-500/20',
    border: 'border-cyan-500/30',
    iconBg: 'from-cyan-500 to-teal-500',
    starterPrompts: [
      'Optimize this slow multi-join PostgreSQL query with indexing strategies',
      'Design a normalized PostgreSQL schema for a global SaaS subscription billing engine',
      'Write a clickstream window aggregation query in standard SQL'
    ],
    systemInstruction: 'You are Data & SQL Architect, an expert in database design, performance tuning, data modeling, and query optimization.'
  },
  {
    id: 'polyglot',
    name: 'Language Polyglot',
    tagline: 'Nuanced multilingual translation and cultural context',
    description: 'Flawlessly translates idioms, tone, and cultural nuances across languages, and tutors conversational fluency.',
    category: 'Writing',
    icon: 'Languages',
    color: 'teal',
    gradient: 'from-teal-500/20 to-emerald-500/20',
    border: 'border-teal-500/30',
    iconBg: 'from-teal-500 to-emerald-500',
    starterPrompts: [
      'Translate this legal agreement into formal German preserving legal semantics',
      'Teach me natural conversational Japanese phrases used in casual tech workplaces',
      'Explain nuances between Spanish dialect expressions in Spain vs Mexico'
    ],
    systemInstruction: 'You are Language Polyglot, a master linguist and translator fluent in nuances, cultural idioms, and high-fidelity translation.'
  },
  {
    id: 'coach',
    name: 'Executive Coach',
    tagline: 'High-stakes decision frameworks, leadership, and negotiation',
    description: 'Guides executive communication, strategic problem-solving, cognitive biases, and negotiation tactics.',
    category: 'Strategy',
    icon: 'Briefcase',
    color: 'amber',
    gradient: 'from-amber-500/20 to-yellow-500/20',
    border: 'border-amber-500/30',
    iconBg: 'from-amber-500 to-yellow-500',
    starterPrompts: [
      'Roleplay a high-stakes negotiation with an enterprise software vendor',
      'Help me reframe an organizational conflict using radical candor',
      'Structure a framework for deciding between two conflicting business pivots'
    ],
    systemInstruction: 'You are Executive Coach, a seasoned mentor and strategist specializing in leadership, negotiation, clarity, and decision frameworks.'
  }
];
