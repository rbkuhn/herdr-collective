#!/bin/sh
# Claude Code statusLine for Herdr's Collective layout: records Cortex (context left) and
# Link (5-hour quota left) for the drone cards. Prints nothing itself.
# To keep another statusline too, pipe "$input" into it below, e.g.:
#   printf '%s' "$input" | /path/to/your-statusline.sh
input=$(cat)
printf '%s' "$input" | node "$HOME/.config/herdr-app/scripts/collective-record.mjs" >/dev/null 2>&1
exit 0
