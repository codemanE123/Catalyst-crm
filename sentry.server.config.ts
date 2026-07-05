import * as Sentry from "@sentry/nextjs";

import { getBaseSentryOptions } from "./lib/monitoring";

Sentry.init(getBaseSentryOptions());
