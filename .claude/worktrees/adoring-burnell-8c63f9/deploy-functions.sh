#!/bin/bash
# Run this once from your terminal to deploy the updated Edge Functions
set -e

cd "$(dirname "$0")"

echo "🚀 Deploying hubspot-data (dealer breakdown + closest_dealer props)..."
npx supabase functions deploy hubspot-data --project-ref ffxhonryhaadyudpopvv

echo ""
echo "🚀 Deploying hubspot-contacts (dealer breakdown for comparison tab)..."
npx supabase functions deploy hubspot-contacts --project-ref ffxhonryhaadyudpopvv

echo ""
echo "✅ Both functions deployed. Reload the dashboard to see dealer details."
