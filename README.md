# Mapa interativo – Campus Jorge Vassilakis

Protótipo estático em HTML, CSS, JavaScript e SVG, criado com base na planta e nas informações fornecidas na conversa.

## Como abrir

1. Extraia o arquivo ZIP.
2. Abra `index.html` no navegador.

Para evitar limitações do navegador durante o desenvolvimento, também é possível executar um servidor local:

```bash
python -m http.server 8000
```

Depois acesse `http://localhost:8000`.

## Recursos já incluídos

- planta desenhada em SVG;
- busca por sala, bloco ou setor;
- filtros por categoria;
- detalhes ao clicar;
- troca entre pavimento inferior e superior do Bloco K;
- zoom e arraste;
- rota esquemática a partir da entrada;
- layout adaptável para computador e celular;
- impressão;
- funcionamento sem bibliotecas externas.

## Onde alterar os dados

As informações das salas ficam no arquivo `app.js`, principalmente nas estruturas:

- `blocks`;
- `floorRooms`;
- `fixedLocations`.

As coordenadas de cada bloco também ficam no objeto `blocks`, usando `x`, `y`, `w` e `h`.

## Observação

O mapa é esquemático e segue a organização visual da planta fornecida. Para deixá-lo fiel às medidas reais, será necessário ajustar as coordenadas com uma planta técnica, levantamento no local ou imagem aérea ortorretificada.
