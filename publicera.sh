#!/bin/sh
# Bygger site/ och publicerar den på grenen gh-pages.
#
# Behövs normalt inte: .github/workflows/publicera.yml gör samma sak vid varje
# push till main. Skriptet finns kvar för att publicera utan att pusha, och
# för att kunna lägga upp sajten med data som bara finns lokalt.
#
# site/ är genererad och ignorerad i main, så den kan inte pushas med subtree.
# I stället kopieras den till en tillfällig katalog som blir en egen commit
# utan historik och tvingas upp på gh-pages. Grenen bär alltså alltid exakt en
# commit: den senast publicerade sajten.
#
# Kör build/fetch.py och build/build.py först om datan ska vara färsk —
# kandidaturer.csv uppdateras varje timme fram till valdagen.
set -e
cd "$(dirname "$0")"

fjarr=$(git remote get-url origin)

[ -d node_modules ] || npm install
npm run bygg

[ -f site/index.html ] || { echo "site/index.html saknas"; exit 1; }
[ -f site/data/index.json ] || { echo "site/data/ saknas — kör build/build.py"; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -R site/. "$tmp/"
# Utan .nojekyll kör GitHub Pages sajten genom Jekyll, som tyst utelämnar
# filer och kataloger som börjar med understreck.
touch "$tmp/.nojekyll"

cd "$tmp"
git init -q -b gh-pages
git add -A
git commit -q -m "Publicerar sajten $(date -u +%Y-%m-%dT%H:%MZ)"
git remote add origin "$fjarr"
git push -qf origin gh-pages
echo "Publicerat till gh-pages."
