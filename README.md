# Moradia — Visita virtual 360°

Visita virtual em Next.js e React, com 22 panoramas ligados por 47 pontos de navegação. A visita começa no exterior e inclui planta 3D, seleção por piso, rotação, zoom e controlo por rato, teclado ou gestos.

## Executar localmente

Requer Node.js 20.9 ou superior e npm.

```sh
npm ci
npm run dev
```

Abrir <http://localhost:3000>. Os endereços de cada panorama usam fragmentos, por exemplo `/#entrada_frontal` ou `/#suite`.

## Validar e executar em produção

```sh
npm run check
npm run build
npm start
```

O servidor usa a porta 3000 por predefinição. Para escolher outra:

```sh
npm start -- --port 8766
```

O projeto requer um servidor Next.js; a política CSP usa um nonce diferente em cada pedido. Pode ser alojado num serviço compatível com Next.js ou num servidor Node.js. Este repositório não configura publicação automática.

## Organização

- `app/`: página, metadados e estilos responsivos.
- `components/Tour.jsx`: interface e navegação da visita.
- `lib/panorama.js`: projeção 360°, renderização WebGL e alternativa Canvas 2D.
- `lib/map.js`: planta 3D e posições dos panoramas.
- `generated/scenes.json`: configuração dos 22 panoramas e das ligações.
- `public/assets/`: imagens aprovadas, miniaturas, planta e imagens de detalhe.
- `proxy.js`: política de segurança para os scripts da aplicação.
- `scripts/validate-tour.mjs`: verificação dos ficheiros e das ligações da visita.

## Panoramas e navegação

As imagens WebP mantêm os mesmos píxeis e a mesma resolução dos PNG originais, com cerca de 35% menos dados. Os PNG continuam incluídos como alternativa. As imagens são carregadas conforme o utilizador muda de panorama.

Para acrescentar uma posição, colocar as imagens em `public/assets/`, adicionar o panorama a `generated/scenes.json` e definir os respetivos `hotspots`. Cada ponto usa o identificador do panorama de destino, `yaw`, `pitch` e `radius`. Os ângulos de orientação são expressos em radianos; `view.fov` usa graus. Adicionar também a posição na planta em `lib/map.js`.

Depois de editar, executar `npm run check` e confirmar visualmente que cada círculo está no chão, junto da passagem correta.

## Telemóvel

A interface adapta-se à orientação vertical e horizontal, respeita as áreas seguras do ecrã e usa controlos com pelo menos 44 píxeis nas vistas móveis. O mapa começa recolhido. É possível arrastar para olhar, usar dois dedos para ampliar e tocar nos círculos para mudar de posição.
