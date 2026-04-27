# Distress Presets

## levels.json

Primary source of truth for UI dropdown and slider defaults.

- Always use this for the main Distress Level selector.
- Collection names should never appear in the main selector.

## policies.json

Optional suggestion/warning layer.

- Used only for auto-suggest and warnings.
- Can be disabled with mode flags.
- Does not block user unless enforce_hard_limits = true.
