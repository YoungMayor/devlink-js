import pc from 'picocolors';

declare const console: any;

type Methods = { [M in string]: (...args: any) => void };

const overloadConsole = ({
  output,
  methods,
}: {
  output: (p: { method: string; args: any[]; oldMethods: Methods }) => void;
  methods: string[];
  invokeOld?: boolean;
}) => {
  const oldMethods: Methods = {};

  for (const m of methods) {
    const method = m as keyof Console;

    if (typeof console[method] !== 'function') continue;

    oldMethods[method] = console[method];

    console[method] = (...args: any[]) => {
      output({ method, args, oldMethods });
    };
  }
};

export const disabledConsoleOutput = () => {
  overloadConsole({
    methods: ['log', 'warn', 'info'],
    output: () => {},
  });
};

export const makeConsoleColored = () => {
  overloadConsole({
    methods: ['log', 'warn', 'error', 'info'],
    output: ({ method, args, oldMethods }) => {
      const fns: Record<string, (arg: string) => string> = {
        warn: pc.yellow,
        info: pc.blue,
        error: pc.red,
      };
      const fn = fns[method] || ((arg: any) => arg);

      oldMethods[method](
        ...args.map((arg) => (typeof arg === 'string' ? fn(arg) : arg)),
      );
    },
  });
};
