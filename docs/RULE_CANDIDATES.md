# Rule Candidates

Working draft of deterministic PPTX export-risk rules. Each candidate must still be validated against Figma/Figma Slides behavior and a smoke-test file before becoming an MVP rule.

## Visual

1. Gradient fill
   - Detection: visible fill type starts with `GRADIENT_`.
   - Risk: gradient may degrade or convert to solid color in PPTX.
   - Severity: warning.

2. Image/vector mask
   - Detection: node has clipping/mask-like structure or a mask node in descendants.
   - Risk: mask may flatten, disappear, or crop differently.
   - Severity: critical.

3. Background blur
   - Detection: visible effect type `BACKGROUND_BLUR`.
   - Risk: PPTX does not preserve the same glass/blur rendering.
   - Severity: warning.

4. Layer blur
   - Detection: visible effect type `LAYER_BLUR`.
   - Risk: blur may rasterize or render differently.
   - Severity: warning.

5. Multiple shadows on one node
   - Detection: more than one visible `DROP_SHADOW` or `INNER_SHADOW`.
   - Risk: PPTX shadow model may not match Figma.
   - Severity: suggestion.

6. Shadow with spread
   - Detection: shadow effect has non-zero spread when available.
   - Risk: spread behavior may not transfer cleanly.
   - Severity: warning.

7. Blend mode not normal
   - Detection: `blendMode` is not `NORMAL` or `PASS_THROUGH`.
   - Risk: compositing may flatten or visually change.
   - Severity: warning.

8. Reduced opacity group
   - Detection: container node opacity below 1 with complex children.
   - Risk: flattening can change visual stacking.
   - Severity: suggestion.

9. Complex vector
   - Detection: vector-like node with high path/network complexity when measurable.
   - Risk: may export as heavy or distorted editable shape.
   - Severity: suggestion.

10. Image fill with crop
    - Detection: image paint has crop/transform settings.
    - Risk: crop may not match PowerPoint image framing.
    - Severity: warning.

## Text

11. Non-system font
    - Detection: text font family not in configured safe font list.
    - Risk: font substitution changes layout.
    - Severity: warning.

12. Missing/unknown font metadata
    - Detection: text font is mixed or cannot be resolved.
    - Risk: export behavior is hard to predict.
    - Severity: suggestion.

13. Mixed text styles in one layer
    - Detection: text node has mixed font/size/weight/range styles.
    - Risk: editable PPTX text may split or render inconsistently.
    - Severity: warning.

14. Text near slide edge
    - Detection: text bounds closer than safe margin to slide bounds.
    - Risk: after font substitution text can clip.
    - Severity: warning.

15. Text outside slide bounds
    - Detection: text bounds exceed slide bounds.
    - Risk: content may appear unexpectedly or be clipped.
    - Severity: critical.

16. Very small font
    - Detection: font size below configured threshold, for example 8px.
    - Risk: PPTX readability and substitution risk.
    - Severity: suggestion.

17. Letter spacing extreme
    - Detection: letter spacing outside configured range.
    - Risk: PPTX may render spacing differently.
    - Severity: suggestion.

18. Auto-resize text risk
    - Detection: text auto-resize settings plus tight bounding box.
    - Risk: exported text can reflow.
    - Severity: warning.

## Structure

19. Non-16:9 slide/frame
    - Detection: slide/frame aspect ratio outside configured allowed ratios.
    - Risk: resulting PPTX slide size may be wrong or inconsistent.
    - Severity: critical.

20. Object outside slide bounds
    - Detection: node bounds exceed slide bounds by more than tolerance.
    - Risk: off-slide objects may export or interfere with the slide.
    - Severity: warning.

21. Nested frame inside slide
    - Detection: descendant node type `FRAME`.
    - Risk: frame semantics may not map cleanly to Slides/PPTX.
    - Severity: warning.

22. Hidden export-relevant content
    - Detection: hidden node with export settings or important naming marker.
    - Risk: exported result may differ from expected visible state.
    - Severity: suggestion.

23. Empty top-level frame/slide
    - Detection: scan root has no visible children.
    - Risk: accidental blank slide.
    - Severity: suggestion.

24. Huge bitmap
    - Detection: image dimensions or exported bytes exceed configured threshold when measurable.
    - Risk: PPTX can become heavy.
    - Severity: suggestion.

## Interactive And Media

25. Prototype interaction
    - Detection: node has reactions/prototype data when accessible.
    - Risk: interactions become static in PPTX.
    - Severity: warning.

26. Video/media fill
    - Detection: video/media paint when accessible.
    - Risk: video becomes static or unsupported.
    - Severity: warning.

27. Component instance with remote dependency
    - Detection: instance node from external component set.
    - Risk: detach/flatten behavior may be unpredictable in export workflows.
    - Severity: suggestion.

28. Unsupported export settings
    - Detection: node export settings use formats/options outside MVP assumptions.
    - Risk: user may expect export behavior the plugin does not support.
    - Severity: suggestion.

