/** Where the 3D view would be, when the browser can't run WebGL 2 (4D). The rest of the planner still works. */
export function NoWebGL() {
  return (
    <div className="viewport no-webgl" data-testid="no-webgl">
      <div className="no-webgl-card" role="alert">
        <h2>This browser can’t draw the 3D view</h2>
        <p>The planner needs WebGL 2, which this browser has turned off or doesn’t have.</p>
        <ul>
          <li>Turn on hardware acceleration in the browser’s settings, then reload.</li>
          <li>Or open the planner in a current Chrome, Edge, Firefox or Safari.</li>
        </ul>
        <p className="muted">Everything else still works: the panels, the plan file, history and the drawing sheets.</p>
      </div>
    </div>
  )
}
