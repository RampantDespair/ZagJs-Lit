import type { Config } from "prettier";

import * as packageJsonPlugin from "prettier-plugin-packagejson";

export default {
  plugins: [packageJsonPlugin],
} satisfies Config;
