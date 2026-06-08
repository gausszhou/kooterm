set -e

pnpm i 

cd packages/kooterm-common
pnpm build

cd -
cd packages/kooterm-portal
pnpm build

cd -
cd packages/kooterm-service
pnpm build

cd -