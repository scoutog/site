window.RUNNING_CONFIG = {
  // Safe for frontend use. Authorization is enforced by Supabase Auth + RLS.
  supabaseUrl: "https://YOUR-PROJECT-REF.supabase.co",
  supabaseAnonKey: "YOUR_PUBLIC_SUPABASE_ANON_KEY",
  authEmail: "running-dashboard@example.com",

  // User preferences. These can be changed inside the authenticated dashboard.
  defaultTimezone: "America/New_York",
  defaultDistanceUnit: "mi",
  defaultMinimumWorkoutSeconds: 600,
  defaultGoalRuns: 3,
  defaultGoalDays: 7,
  defaultHeartRateZones: [
    { zone: 1, lower: 0, upper: 129 },
    { zone: 2, lower: 130, upper: 149 },
    { zone: 3, lower: 150, upper: 164 },
    { zone: 4, lower: 165, upper: 179 },
    { zone: 5, lower: 180, upper: null }
  ],

  // Keep false in production. Sample data is only for local development.
  allowDevelopmentFixture: false
};
