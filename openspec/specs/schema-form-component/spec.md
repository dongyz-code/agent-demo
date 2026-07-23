# schema-form-component Specification

## Purpose
TBD - created by archiving change add-schema-form-component. Update Purpose after archive.
## Requirements
### Requirement: Schema columns API
`VSchemaForm` MUST accept a `columns` prop as the primary field schema and MUST render form fields from column definitions.

Each column MUST support `dataIndex`, `title`, `valueType`, `fieldProps`, `formItemProps`, `colProps`, `search`, `form`, `hidden`, `disabled`, `readonly`, and `renderFormItem` configuration. The component MUST emit `update:modelValue` when a field value changes.

#### Scenario: Render fields from columns
- **WHEN** `VSchemaForm` receives columns for `username` and `status`
- **THEN** it renders one form item for each visible column and binds each control to the matching `modelValue` key

#### Scenario: Update field value
- **WHEN** the user edits the control for column `username`
- **THEN** the component emits `update:modelValue` with a new form object containing the updated `username` value

### Requirement: Legacy FormItem control compatibility
`VSchemaForm` MUST allow a column to provide `data?: FormItem['data']` and MUST render the equivalent legacy control type without requiring old `FormItem[][]` options.

When both `data` and `valueType` are provided, the component MUST use `data` for control rendering. The component MUST NOT accept old two-dimensional `options` as a compatibility API.

#### Scenario: Render legacy select data
- **WHEN** a column provides `data: { type: 'select', options, props }`
- **THEN** `VSchemaForm` renders a select control using the provided options and props

#### Scenario: Reject old layout contract
- **WHEN** a caller migrates from `VFormItems`
- **THEN** they must convert `label/key/range/required/data` into `title/dataIndex/colProps/formItemProps/data` instead of passing `FormItem[][]`

### Requirement: Value type rendering
`VSchemaForm` MUST provide built-in renderers for common `valueType` values including text, textarea, password, number, select, date, dateRange, switch, radio, checkbox, cascader, and custom.

The renderer registry MUST be extensible inside the UI package so future controls can be added without growing a single monolithic conditional renderer.

#### Scenario: Render valueType input
- **WHEN** a column has `valueType: 'text'`
- **THEN** the component renders an Element Plus input bound to that column value

#### Scenario: Render date range
- **WHEN** a column has `valueType: 'dateRange'`
- **THEN** the component renders a date range picker bound to that column value

### Requirement: Query form actions
When `mode` is `search`, `VSchemaForm` MUST provide built-in search, reset, expand/collapse, and custom action behavior.

The component MUST emit `submit` with transformed query params and the raw form. The component MUST emit `reset` after applying reset behavior. Custom actions MUST emit `action` with the action key and current form.

#### Scenario: Submit search form
- **WHEN** the user clicks the default search button
- **THEN** the component emits `submit` with query params derived from visible searchable columns

#### Scenario: Reset search form
- **WHEN** the user clicks the default reset button
- **THEN** the component resets values to `initialValues` or the mount-time snapshot and emits `reset`

#### Scenario: Trigger custom action
- **WHEN** a configured custom action button is clicked
- **THEN** the component emits `action` with that action key and the current form value

### Requirement: Expand and collapse search fields
`VSchemaForm` MUST support collapsed search forms through `search.defaultCollapsed`, `search.collapsedRows`, per-column `search.collapsed`, and `v-model:collapsed`.

The action area MUST remain visible in both collapsed and expanded states.

#### Scenario: Collapse extra fields
- **WHEN** `mode` is `search`, collapsed mode is active, and fields exceed `collapsedRows`
- **THEN** fields outside the collapsed rows or marked `search.collapsed` are hidden while the action area remains visible

#### Scenario: Toggle collapsed state
- **WHEN** the user clicks the expand/collapse control
- **THEN** the component toggles visible search fields and emits `update:collapsed`

### Requirement: Grid layout
`VSchemaForm` MUST use CSS grid based layout and MUST support custom column counts and per-field span.

The layout system MUST use `colProps.span`, `colProps.offset`, and `colProps.full` instead of the old `range` property.

#### Scenario: Custom column count
- **WHEN** layout or search config sets `columns: 4`
- **THEN** the form renders fields in a four-column grid

#### Scenario: Field spans multiple columns
- **WHEN** a column has `colProps: { span: 2 }`
- **THEN** that field occupies two grid columns

### Requirement: Reactive column functions
`VSchemaForm` MUST support function-valued `hidden`, `disabled`, `readonly`, `fieldProps`, and `formItemProps` that receive a reactive context containing the current form and column.

The component MUST NOT require a React-style `dependencies` option for visual state updates.

#### Scenario: Disable field from form state
- **WHEN** `fieldProps` or `disabled` reads `ctx.form.org_id`
- **THEN** changing `org_id` updates the rendered field state through Vue reactivity

#### Scenario: Hide field from form state
- **WHEN** `hidden` returns true for the current form
- **THEN** the field is not rendered in the form grid

### Requirement: Option sources
`VSchemaForm` MUST support static `valueEnum`, asynchronous `request`, and legacy `data.options` as option sources for option-based controls.

For asynchronous `request`, the component MUST support `reloadOn` to explicitly reload options when named form fields change. Older requests MUST NOT overwrite newer request results.

#### Scenario: Render valueEnum options
- **WHEN** a select column defines `valueEnum`
- **THEN** the component renders options derived from that enum

#### Scenario: Reload request on field change
- **WHEN** a select column defines `reloadOn: ['org_id']`
- **THEN** changing `org_id` reloads that column's options by calling `request`

#### Scenario: Ignore stale request result
- **WHEN** two option requests are in flight and the first request resolves after the second
- **THEN** the component keeps the second request result

### Requirement: Submit value transform
`VSchemaForm` MUST support per-column `search.transform` for query submission.

When no transform is provided, the component MUST submit the field value under `dataIndex`. When transform is provided, the returned object MUST be merged into the submit params.

#### Scenario: Transform date range
- **WHEN** a date range search column transforms `[start, end]` into `{ start_time, end_time }`
- **THEN** the `submit` event params contain `start_time` and `end_time` instead of the original range key

### Requirement: Form validation and exposed methods
`VSchemaForm` MUST integrate with Element Plus form validation and MUST expose imperative methods for validation, reset, clearing validation, submit, reset action, and collapse toggling.

`formItemProps.required` and `formItemProps.rules` MUST be passed to the underlying form item.

#### Scenario: Validate required field
- **WHEN** a column has `formItemProps.required: true` and the field value is empty
- **THEN** `validate()` reports validation failure through Element Plus form validation

#### Scenario: Use exposed submit method
- **WHEN** parent code calls the exposed `submit()` method
- **THEN** the component performs the same behavior as clicking the default search submit button

### Requirement: Vue slots for customization
`VSchemaForm` MUST expose Vue slots for action customization and field customization.

The component MUST support an `actions` slot for the action area and field slots keyed by `dataIndex` for custom field rendering.

#### Scenario: Override action area
- **WHEN** the parent provides the `actions` slot
- **THEN** the component renders the custom action area with submit, reset, and collapse helpers in slot props

#### Scenario: Override a field
- **WHEN** the parent provides a field slot matching a column `dataIndex`
- **THEN** the component renders that slot instead of the default renderer for the field

