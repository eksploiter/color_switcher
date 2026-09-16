figma.showUI(__html__, {
  width: 400,
  height: 570,
  themeColors: true,
  title: "Color Switcher"
});


// ============================================================
// HEX Utility
// ============================================================

function normalizeHex(value) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .trim()
    .replace(/^#/, "")
    .toUpperCase();

  if (!/^[0-9A-F]{6}$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}


function hexToRgb(hex) {
  const normalized = normalizeHex(hex);

  if (!normalized) {
    return null;
  }

  return {
    r: parseInt(normalized.substring(0, 2), 16) / 255,
    g: parseInt(normalized.substring(2, 4), 16) / 255,
    b: parseInt(normalized.substring(4, 6), 16) / 255
  };
}


function rgbToHex(rgb) {
  const r = Math.round(rgb.r * 255);
  const g = Math.round(rgb.g * 255);
  const b = Math.round(rgb.b * 255);

  return (
    r.toString(16).padStart(2, "0") +
    g.toString(16).padStart(2, "0") +
    b.toString(16).padStart(2, "0")
  ).toUpperCase();
}


function isSameColor(rgb, hex) {
  if (!rgb || !hex) {
    return false;
  }

  return rgbToHex(rgb) === normalizeHex(hex);
}


// ============================================================
// Fill 사용 가능 Node 판별
// ============================================================

function canHaveFill(node) {

  if (!node) {
    return false;
  }

  // 텍스트는 Shape 변경에서 제외
  if (node.type === "TEXT") {
    return false;
  }

  // Group / Slice처럼 fills가 없는 Node 제외
  if (!("fills" in node)) {
    return false;
  }

  return true;
}


// ============================================================
// Paint 색상 변경
// ============================================================

function createRecoloredSolidPaint(originalPaint, targetRgb) {

  const newPaint = {
    ...originalPaint,

    color: {
      r: targetRgb.r,
      g: targetRgb.g,
      b: targetRgb.b
    }
  };

  return newPaint;
}


// ============================================================
// 선택 영역 내부 모든 Node 수집
// ============================================================

function collectAllNodes(selection) {

  const nodeMap = new Map();

  function addNode(node) {

    if (!node || !node.id) {
      return;
    }

    nodeMap.set(node.id, node);
  }


  for (const rootNode of selection) {

    // 중요:
    // 선택한 Frame / Instance / Component 자체도 검사
    addNode(rootNode);


    // 내부 모든 하위 레이어 검사
    if (
      typeof rootNode.findAll === "function"
    ) {

      try {

        const children =
          rootNode.findAll(() => true);

        for (const child of children) {
          addNode(child);
        }

      } catch (error) {

        console.warn(
          "Child search failed:",
          error
        );
      }
    }
  }


  return Array.from(
    nodeMap.values()
  );
}


// ============================================================
// Text Node 수집
// ============================================================

function collectTextNodes(selection) {

  const textMap = new Map();


  function addText(node) {

    if (
      node &&
      node.type === "TEXT"
    ) {

      textMap.set(
        node.id,
        node
      );
    }
  }


  for (const rootNode of selection) {

    addText(rootNode);


    if (
      typeof rootNode.findAllWithCriteria === "function"
    ) {

      try {

        const nodes =
          rootNode.findAllWithCriteria({
            types: ["TEXT"]
          });


        for (const node of nodes) {
          addText(node);
        }

        continue;

      } catch (error) {

        console.warn(
          "findAllWithCriteria failed:",
          error
        );
      }
    }


    if (
      typeof rootNode.findAll === "function"
    ) {

      try {

        const nodes =
          rootNode.findAll(
            node =>
              node.type === "TEXT"
          );


        for (const node of nodes) {
          addText(node);
        }

      } catch (error) {

        console.warn(
          "Text search failed:",
          error
        );
      }
    }
  }


  return Array.from(
    textMap.values()
  );
}


// ============================================================
// Shape / Fill Node 수집
// ============================================================

function collectFillNodes(selection) {

  const allNodes =
    collectAllNodes(selection);


  return allNodes.filter(
    node => canHaveFill(node)
  );
}


// ============================================================
// Text Color 변경
// ============================================================

function applyTextColor(targetHex) {

  const normalizedTarget =
    normalizeHex(targetHex);


  if (!normalizedTarget) {

    return {
      success: false,
      message:
        "올바른 6자리 HEX 코드를 입력해주세요."
    };
  }


  const selection =
    figma.currentPage.selection;


  if (selection.length === 0) {

    return {
      success: false,
      message:
        "먼저 텍스트 또는 프레임을 선택해주세요."
    };
  }


  const targetRgb =
    hexToRgb(normalizedTarget);


  const textNodes =
    collectTextNodes(selection);


  if (textNodes.length === 0) {

    return {
      success: false,
      message:
        "선택 영역에서 텍스트를 찾지 못했습니다."
    };
  }


  let changedCount = 0;
  let failedCount = 0;


  for (const node of textNodes) {

    try {

      const fills = node.fills;


      // 기존 Fill 구조가 일반 배열인 경우
      if (
        fills !== figma.mixed &&
        Array.isArray(fills) &&
        fills.length > 0
      ) {

        let foundSolid = false;


        const newFills =
          fills.map((paint) => {

            if (
              paint.type !== "SOLID"
            ) {
              return paint;
            }


            foundSolid = true;


            return createRecoloredSolidPaint(
              paint,
              targetRgb
            );
          });


        if (foundSolid) {

          node.fills =
            newFills;

        } else {

          node.fills = [
            {
              type: "SOLID",

              color: {
                r: targetRgb.r,
                g: targetRgb.g,
                b: targetRgb.b
              }
            }
          ];
        }

      } else {

        // Mixed Fill 텍스트도
        // 최종적으로 하나의 색상으로 통일
        node.fills = [
          {
            type: "SOLID",

            color: {
              r: targetRgb.r,
              g: targetRgb.g,
              b: targetRgb.b
            }
          }
        ];
      }


      changedCount++;

    } catch (error) {

      console.error(
        `Text change failed: ${node.name}`,
        error
      );

      failedCount++;
    }
  }


  return {
    success: true,

    changedCount,

    failedCount,

    message:
      failedCount === 0
        ? `${changedCount}개의 텍스트를 #${normalizedTarget} 색상으로 변경했습니다.`
        : `${changedCount}개 변경 완료 · ${failedCount}개 변경 실패`
  };
}


// ============================================================
// Shape Color 변경
// ============================================================

async function applyShapeColor(
  sourceHex,
  targetHex
) {

  const normalizedSource =
    normalizeHex(sourceHex);

  const normalizedTarget =
    normalizeHex(targetHex);


  if (!normalizedSource) {

    return {
      success: false,
      message:
        "찾을 색상의 HEX 코드를 확인해주세요."
    };
  }


  if (!normalizedTarget) {

    return {
      success: false,
      message:
        "변경할 색상의 HEX 코드를 확인해주세요."
    };
  }


  const selection =
    figma.currentPage.selection;


  if (selection.length === 0) {

    return {
      success: false,
      message:
        "먼저 변경할 영역을 선택해주세요."
    };
  }


  const targetRgb =
    hexToRgb(normalizedTarget);


  // Rectangle 등 특정 타입이 아니라
  // Fill을 가질 수 있는 모든 Node 검색
  const fillNodes =
    collectFillNodes(selection);


  if (fillNodes.length === 0) {

    return {
      success: false,
      message:
        "선택 영역에서 Fill을 가진 레이어를 찾지 못했습니다."
    };
  }


  let scannedNodeCount = 0;
  let matchedNodeCount = 0;
  let changedNodeCount = 0;
  let changedFillCount = 0;
  let failedCount = 0;


  for (const node of fillNodes) {

    scannedNodeCount++;


    try {

      const fills =
        node.fills;


      // Mixed Fill은 Shape 검색 대상에서 제외
      if (
        fills === figma.mixed
      ) {
        continue;
      }


      if (
        !Array.isArray(fills) ||
        fills.length === 0
      ) {
        continue;
      }


      let nodeMatched = false;
      let nodeChangedFillCount = 0;


      const newFills =
        fills.map((paint) => {

          // Gradient / Image 등은 그대로 유지
          if (
            paint.type !== "SOLID"
          ) {
            return paint;
          }


          // 숨겨진 Fill은 제외
          if (
            paint.visible === false
          ) {
            return paint;
          }


          const currentHex =
            rgbToHex(
              paint.color
            );


          console.log(
            `[Color Switcher] ${node.name} (${node.type}) : #${currentHex}`
          );


          // 입력한 색상과 같을 경우에만 변경
          if (
            isSameColor(
              paint.color,
              normalizedSource
            )
          ) {

            nodeMatched = true;
            nodeChangedFillCount++;


            return createRecoloredSolidPaint(
              paint,
              targetRgb
            );
          }


          return paint;
        });


      if (!nodeMatched) {
        continue;
      }


      matchedNodeCount++;


      try {

        node.fills =
          newFills;

      } catch (error) {

        if (
          typeof node.setFillsAsync ===
          "function"
        ) {

          await node.setFillsAsync(
            newFills
          );

        } else {

          throw error;
        }
      }


      changedNodeCount++;

      changedFillCount +=
        nodeChangedFillCount;


      console.log(
        `[Color Switcher] 변경 완료 : ${node.name} (${node.type})`
      );


    } catch (error) {

      console.error(
        `[Color Switcher] 변경 실패 : ${node.name} (${node.type})`,
        error
      );

      failedCount++;
    }
  }


  if (matchedNodeCount === 0) {

    return {
      success: false,

      message:
        `#${normalizedSource} Fill을 찾지 못했습니다. ` +
        `(${scannedNodeCount}개 레이어 검사)`
    };
  }


  return {
    success: true,

    changedNodeCount,

    changedFillCount,

    failedCount,

    message:
      failedCount === 0

        ? `${changedNodeCount}개의 레이어에서 #${normalizedSource} → #${normalizedTarget} 색상으로 변경했습니다.`

        : `${changedNodeCount}개 변경 완료 · ${failedCount}개 변경 실패`
  };
}


// ============================================================
// Selection 상태
// ============================================================

function sendSelectionStats() {

  const selection =
    figma.currentPage.selection;


  if (selection.length === 0) {

    figma.ui.postMessage({
      type: "selection-stats",

      selectionCount: 0,
      textCount: 0,
      shapeCount: 0
    });

    return;
  }


  const textNodes =
    collectTextNodes(selection);


  const fillNodes =
    collectFillNodes(selection);


  figma.ui.postMessage({
    type: "selection-stats",

    selectionCount:
      selection.length,

    textCount:
      textNodes.length,

    shapeCount:
      fillNodes.length
  });
}


// ============================================================
// Selection Change
// ============================================================

figma.on(
  "selectionchange",

  () => {
    sendSelectionStats();
  }
);


// ============================================================
// UI Message
// ============================================================

figma.ui.onmessage =
  async (msg) => {


    if (!msg || !msg.type) {
      return;
    }


    // --------------------------------------------------------
    // Text
    // --------------------------------------------------------

    if (
      msg.type === "apply-text"
    ) {

      const result =
        applyTextColor(
          msg.targetHex
        );


      figma.ui.postMessage({
        type: "result",
        category: "text",
        ...result
      });


      figma.notify(
        result.message,
        {
          timeout: 2500
        }
      );


      sendSelectionStats();

      return;
    }


    // --------------------------------------------------------
    // Shape
    // --------------------------------------------------------

    if (
      msg.type === "apply-shape"
    ) {

      const result =
        await applyShapeColor(
          msg.sourceHex,
          msg.targetHex
        );


      figma.ui.postMessage({
        type: "result",
        category: "shape",
        ...result
      });


      figma.notify(
        result.message,
        {
          timeout: 2500
        }
      );


      sendSelectionStats();

      return;
    }


    // --------------------------------------------------------
    // Refresh
    // --------------------------------------------------------

    if (
      msg.type ===
      "refresh-selection"
    ) {

      sendSelectionStats();

      return;
    }


    // --------------------------------------------------------
    // Close
    // --------------------------------------------------------

    if (
      msg.type === "close"
    ) {

      figma.closePlugin();
    }
  };


// 최초 실행
sendSelectionStats();
