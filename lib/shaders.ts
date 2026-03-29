export const VERTEX_SHADER = /* glsl */ `
  attribute float aAngle;
  attribute float aRadius;
  attribute float aPhase;

  uniform float uTime;
  uniform float uSpeed;
  uniform float uShapeF;

  varying float vRadius;

  #define PI 3.14159265358979
  #define TAU 6.28318530717959

  void main() {
    float t = uTime * uSpeed + aPhase;

    // Radius with gentle pulsing
    float r = aRadius * 4.0 + sin(t * 0.5 + aPhase * 2.0) * 0.25;

    // Fluid angle: smooth continuous drift
    float fluidAngle = aAngle + t * 0.25 + sin(t * 0.18 + aPhase) * 0.5;

    // Geometric angle: snap to 3-fold symmetry (triangle)
    float snappedAngle = round(fluidAngle / (TAU / 3.0)) * (TAU / 3.0);

    float angle = mix(fluidAngle, snappedAngle, uShapeF);

    float x = r * cos(angle);
    float y = r * sin(angle);
    float z = sin(t * 0.35 + aPhase * 3.0) * 0.6;

    vec4 mvPosition = modelViewMatrix * vec4(x, y, z, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Larger near center, smaller at edges; perspective scale
    float baseSize = mix(6.0, 2.0, aRadius);
    gl_PointSize = baseSize * (250.0 / -mvPosition.z);

    vRadius = aRadius;
  }
`;

export const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;

  varying float vRadius;

  void main() {
    // Discard outside circle boundary
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    if (dist > 0.5) discard;

    // Soft falloff: bright core, fading edge
    float alpha = (1.0 - smoothstep(0.15, 0.5, dist)) * mix(0.85, 0.25, vRadius);

    // Slightly brighter at particle center
    vec3 color = uColor * (1.0 + (0.5 - dist) * 0.5);

    gl_FragColor = vec4(color, alpha);
  }
`;
