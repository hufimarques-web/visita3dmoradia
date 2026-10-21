# Domaine XXV — Visita virtual 360°

Visita virtual em Next.js e React, com 22 panoramas ligados por 47 pontos de navegação. A visita começa na sala e inclui planta 3D, seleção por piso (R/C, 1.º andar e Sótão), rotação, zoom e controlo por rato, teclado ou gestos. A fachada continua acessível pelo menu, pela planta e por ligação direta.

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
npm test
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

As imagens WebP são comprimidas com qualidade 94 a partir dos PNG aprovados, sem reduzir a resolução. Pesam entre 136 e 496 KB (cerca de 5,6 MB no conjunto). Os PNG continuam incluídos como alternativa em caso de erro. Não há carregamento antecipado de outras cenas: só a posição pedida e os seus detalhes são descarregados. Ao mudar de destino, os pedidos anteriores são cancelados e as texturas antigas são libertadas.

O primeiro panorama é antecipado antes da hidratação, respeitando os links diretos. A planta só é carregada quando visível, depois do panorama; as miniaturas só são montadas ao abrir o menu. As imagens com hash no nome usam cache permanente. A transição dissolve a última imagem na seguinte durante 420 ms, sem escurecer a cena enquanto se espera. Respeita a preferência por movimento reduzido.

Para gerar as versões comprimidas, a planta e o cartão de partilha a partir dos originais:

```sh
npm run prepare:media
```

A imagem social é uma projeção da fachada aprovada, em JPEG 1200 × 630, com metadados Open Graph e Twitter. O domínio canónico está definido em `app/layout.jsx`.

Os panoramas originais têm resolução limitada (na maioria 1774 × 887). A aplicação preserva essa resolução e evita desfoque nas transições, mas não inventa detalhe. Para nitidez fotográfica em ecrã inteiro são necessários originais 360° de maior resolução. O tempo de abertura deve ser medido numa ligação representativa: não é garantido em todas as redes móveis.

Na verificação de 21/10/2026, o primeiro panorama ficou interativo em 1,87 s num ecrã de 390 × 844, com cache desligada, débito agregado limitado a 3 Mbps e atraso de resposta de 150 ms. Foram transferidos 444 KB e apenas a imagem da sala. Um link direto para a suíte carregou apenas a suíte (1,67 s). Estes são testes de rede simulada num computador, sem limitação de CPU, não uma garantia para todos os telemóveis.

Para acrescentar uma posição, colocar as imagens em `public/assets/`, adicionar o panorama a `generated/scenes.json` e definir os respetivos `hotspots`. Cada ponto usa o identificador do panorama de destino, `yaw`, `pitch` e `radius`. Os ângulos de orientação são expressos em radianos; `view.fov` usa graus. Adicionar também a posição na planta em `lib/map.js`.

Depois de editar, executar `npm run check` e confirmar visualmente que cada círculo está no chão, junto da passagem correta.

## Telemóvel

A interface adapta-se à orientação vertical e horizontal, respeita as áreas seguras do ecrã e usa controlos com pelo menos 44 píxeis nas vistas móveis. O mapa começa recolhido. É possível arrastar para olhar, usar dois dedos para ampliar e tocar nos círculos para mudar de posição.
