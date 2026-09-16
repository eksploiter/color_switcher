figma.showUI(__html__, {
  width: 400,
  height: 570,
  themeColors: true,
  title: "Color Switcher"
});

// ============================================================
// Color Switcher
// ============================================================

// 구조용 Frame / Group은 제외하고,
// 실제 "도형"으로 취급할 Node Type만 지정
const SHAPE_TYPES = new Set([
  "RECTANGLE",
  "ELLIPSE",
  "POLYGON",
  "STAR",
  "VECTOR",
  "BOOLEAN_OPERATION"
]);

const SHAPE_TYPE_ARRAY = Array.from(SHAPE_TYPES);


// ============================================================
// HEX 관련 Utility
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


// Figma RGB는 0 ~ 1 사이의 Float이기 때문에
// 0~255 정수로 변환해서 비교
function isSameColor(rgb, hex) {
  if (!rgb || !hex) {
    return false;
  }

  return rgbToHex(rgb) === normalizeHex(hex);
}


// 기존 Solid Fill의 opacity / blend mode 등을 최대한 유지하면서
// 색상만 변경
function createRecoloredSolidPaint(originalPaint, targetRgb) {
  const paint = {
    type: "SOLID",
    color: {
      r: targetRgb.r,
      g: targetRgb.g,
      b: targetRgb.b
    }
  };

  if (typeof originalPaint.opacity === "number") {
    paint.opacity = originalPaint.opacity;
  }

  if (typeof originalPaint.visible === "boolean") {
    paint.visible = originalPaint.visible;
  }

  if (originalPaint.blendMode) {
    paint.blendMode = originalPaint.blendMode;
  }

  return paint;
}


// ============================================================
// Node 수집
// ============================================================

function collectNodesFromSelection() {
  const selection = figma.currentPage.selection;

  const textMap = new Map();
  const shapeMap = new Map();

  function addNode(node) {
    if (!node || !node.id) {
      return;
    }

    if (node.type === "TEXT") {
      textMap.set(node.id, node);
    }

    if (SHAPE_TYPES.has(node.type)) {
      shapeMap.set(node.id, node);
    }
  }

  for (const rootNode of selection) {
    // 선택한 Node 그 자체 확인
    addNode(rootNode);

    // Frame / Group / Instance 등의 내부 탐색
    if (
      typeof rootNode.findAllWithCriteria === "function"
    ) {
      try {
        const textNodes =
          rootNode.findAllWithCriteria({
            types: ["TEXT"]
          });

        for (const node of textNodes) {
          textMap.set(node.id, node);
        }

        const shapeNodes =
          rootNode.findAllWithCriteria({
            types: SHAPE_TYPE_ARRAY
          });

        for (const node of shapeNodes) {
          shapeMap.set(node.id, node);
        }

        continue;
      } catch (error) {
        console.warn(
          "findAllWithCriteria failed:",
          error
        );
      }
    }

    // 혹시 findAllWithCriteria를 지원하지 않는 Node일 경우 fallback
    if (
      typeof rootNode.findAll === "function"
    ) {
      try {
        const children = rootNode.findAll(
          (node) =>
            node.type === "TEXT" ||
            SHAPE_TYPES.has(node.type)
        );

        for (const child of children) {
          addNode(child);
        }
      } catch (error) {
        console.warn(
          "findAll fallback failed:",
          error
        );
      }
    }
  }

  return {
    textNodes: Array.from(textMap.values()),
    shapeNodes: Array.from(shapeMap.values())
  };
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
      message: "올바른 6자리 HEX 코드를 입력해주세요."
    };
  }

  const selection =
    figma.currentPage.selection;

  if (selection.length === 0) {
    return {
      success: false,
      message: "먼저 텍스트 또는 프레임을 선택해주세요."
    };
  }

  const targetRgb =
    hexToRgb(normalizedTarget);

  const {
    textNodes
  } = collectNodesFromSelection();

  if (textNodes.length === 0) {
    return {
      success: false,
      message: "선택 영역에서 텍스트를 찾지 못했습니다."
    };
  }

  let changedCount = 0;
  let failedCount = 0;

  for (const node of textNodes) {
    try {
      let opacity = 1;

      // 기존 텍스트 Fill이 하나의 Solid 색이라면
      // opacity는 그대로 유지
      if (
        node.fills !== figma.mixed &&
        Array.isArray(node.fills)
      ) {
        const solidPaint =
          node.fills.find(
            (paint) =>
              paint.type === "SOLID"
          );

        if (
          solidPaint &&
          typeof solidPaint.opacity === "number"
        ) {
          opacity =
            solidPaint.opacity;
        }
      }

      node.fills = [
        {
          type: "SOLID",
          color: {
            r: targetRgb.r,
            g: targetRgb.g,
            b: targetRgb.b
          },
          opacity: opacity
        }
      ];

      changedCount++;

    } catch (error) {
      console.error(
        `Text color change failed: ${node.name}`,
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
      message: "찾을 색상의 HEX 코드를 확인해주세요."
    };
  }

  if (!normalizedTarget) {
    return {
      success: false,
      message: "변경할 색상의 HEX 코드를 확인해주세요."
    };
  }

  const selection =
    figma.currentPage.selection;

  if (selection.length === 0) {
    return {
      success: false,
      message: "먼저 도형 또는 프레임을 선택해주세요."
    };
  }

  const targetRgb =
    hexToRgb(normalizedTarget);

  const {
    shapeNodes
  } = collectNodesFromSelection();

  if (shapeNodes.length === 0) {
    return {
      success: false,
      message: "선택 영역에서 변경 가능한 도형을 찾지 못했습니다."
    };
  }

  let changedNodeCount = 0;
  let changedFillCount = 0;
  let matchedNodeCount = 0;
  let failedCount = 0;

  for (const node of shapeNodes) {

    try {
      const fills = node.fills;

      if (
        fills === figma.mixed ||
        !Array.isArray(fills) ||
        fills.length === 0
      ) {
        continue;
      }

      let nodeMatched = false;
      let nodeChangedFillCount = 0;

      const newFills =
        fills.map((paint) => {

          // Gradient / Image 등은 건드리지 않음
          if (paint.type !== "SOLID") {
            return paint;
          }

          // 숨겨진 Fill은 제외
          if (paint.visible === false) {
            return paint;
          }

          // 입력한 원본 색상과 동일한 경우만 변경
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
        // 대부분의 일반적인 Fill
        node.fills = newFills;

      } catch (fillError) {

        // Pattern Fill 등이 함께 존재할 때를 위한 fallback
        if (
          typeof node.setFillsAsync === "function"
        ) {
          await node.setFillsAsync(
            newFills
          );
        } else {
          throw fillError;
        }
      }


      changedNodeCount++;
      changedFillCount +=
        nodeChangedFillCount;

    } catch (error) {
      console.error(
        `Shape color change failed: ${node.name}`,
        error
      );

      failedCount++;
    }
  }


  if (matchedNodeCount === 0) {
    return {
      success: false,
      message:
        `#${normalizedSource} 색상의 도형을 찾지 못했습니다.`
    };
  }


  return {
    success: true,
    changedNodeCount,
    changedFillCount,
    failedCount,
    message:
      failedCount === 0
        ? `${changedNodeCount}개의 도형을 #${normalizedSource} → #${normalizedTarget} 색상으로 변경했습니다.`
        : `${changedNodeCount}개 도형 변경 완료 · ${failedCount}개 변경 실패`
  };
}


// ============================================================
// Selection 정보 UI 전달
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

  const {
    textNodes,
    shapeNodes
  } = collectNodesFromSelection();

  figma.ui.postMessage({
    type: "selection-stats",
    selectionCount:
      selection.length,

    textCount:
      textNodes.length,

    shapeCount:
      shapeNodes.length
  });
}


// 선택 영역이 바뀔 때마다 UI 갱신
figma.on(
  "selectionchange",
  () => {
    sendSelectionStats();
  }
);


// ============================================================
// UI Message 처리
// ============================================================

figma.ui.onmessage =
  async (msg) => {

    if (!msg || !msg.type) {
      return;
    }


    // --------------------------------------------------------
    // Text Color
    // --------------------------------------------------------

    if (msg.type === "apply-text") {

      const result =
        applyTextColor(
          msg.targetHex
        );

      figma.ui.postMessage({
        type: "result",
        category: "text",
        ...result
      });

      if (result.success) {
        figma.notify(
          result.message,
          {
            timeout: 2500
          }
        );
      }

      sendSelectionStats();

      return;
    }


    // --------------------------------------------------------
    // Shape Color
    // --------------------------------------------------------

    if (msg.type === "apply-shape") {

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

      if (result.success) {
        figma.notify(
          result.message,
          {
            timeout: 2500
          }
        );
      }

      sendSelectionStats();

      return;
    }


    // --------------------------------------------------------
    // Selection Refresh
    // --------------------------------------------------------

    if (msg.type === "refresh-selection") {
      sendSelectionStats();
      return;
    }


    // --------------------------------------------------------
    // Close
    // --------------------------------------------------------

    if (msg.type === "close") {
      figma.closePlugin();
    }
  };


// 최초 실행 시 현재 선택 상태 전달
sendSelectionStats();
