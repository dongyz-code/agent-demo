import type { CSSProperties, Component, ComputedRef, Ref, VNode } from 'vue';
import type {
  ElButton,
  ElCascader,
  ElCheckboxGroup,
  ElDatePicker,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElRadioGroup,
  ElSelect,
  ElSwitch,
} from 'element-plus';

/** 表单值对象，组件所有字段都从该对象读取或写入。 */
export type SchemaFormModel = Record<string, unknown>;

/** 字段路径，字符串支持 `a.b.c` 点路径，数组用于保留 Element Plus prop 路径能力。 */
export type SchemaFormDataIndex<T extends SchemaFormModel> =
  | keyof T
  | string
  | Array<string | number>;

/** 表单模式，查询模式会启用搜索、重置和展开收起动作区。 */
export type SchemaFormMode = 'form' | 'search';

/** 断点列数配置；对象形式会按组件容器宽度实时解析。 */
export type SchemaFormColumns =
  | number
  | Partial<Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', number>>;

/** 内置字段渲染类型，负责把 schema 映射到 Element Plus 控件。 */
export type SchemaValueType =
  | 'text'
  | 'textarea'
  | 'password'
  | 'number'
  | 'select'
  | 'date'
  | 'dateRange'
  | 'switch'
  | 'radio'
  | 'checkbox'
  | 'cascader'
  | 'custom';

/** 选项值类型，兼容 Element Plus 选择类控件的常见 value。 */
export type SchemaFormOptionValue = string | number | boolean;

/** 表单选项，select/radio/checkbox/cascader/valueEnum/request 会统一归一化成该结构。 */
export interface SchemaFormOption {
  /** 显示文案。 */
  label: string;
  /** 提交值。 */
  value: SchemaFormOptionValue;
  /** 是否禁用该选项。 */
  disabled?: boolean;
  /** 自定义选项内容，适用于需要覆盖默认 label 的选择类控件。 */
  render?: VNode | string | (() => VNode | string);
  /** 子级选项，供 cascader 使用。 */
  children?: SchemaFormOption[];
  /** 允许业务选项携带额外字段。 */
  [key: string]: unknown;
}

/** 支持直接值、Ref 和 ComputedRef 的选项来源。 */
export type SchemaMaybeRef<T> = T | Ref<T> | ComputedRef<T>;

/** 支持同步值和异步值的返回类型。 */
export type SchemaMaybePromise<T> = T | Promise<T>;

/** schema-form 控件选项来源，支持直接值、响应式值和懒执行函数。 */
export type SchemaFormOptionsSource<T> =
  | SchemaMaybeRef<T>
  | (() => SchemaMaybePromise<SchemaMaybeRef<T>>);

/** schema-form 控件懒加载选项配置，函数返回当前控件可直接使用的选项数组。 */
export type SchemaFormLazyOptions<T> =
  | boolean
  | (() => SchemaMaybePromise<T>);

/** 级联控件选项类型，直接复用 Element Plus 的 cascader options 结构。 */
export type SchemaFormCascaderOptions = NonNullable<
  InstanceType<typeof ElCascader>['$props']['options']
>;

/** schema-form `data` 控件配置，用于表达 Element Plus 控件和少量自定义控件。 */
export type SchemaFormControlData =
  | {
      /** 控件类型，使用自定义 Vue 组件接管字段渲染。 */
      type: 'component';
      /** 渲染字段的 Vue 组件，组件会接收 modelValue 和 update 事件。 */
      component: Component;
      /** 传给自定义组件的业务参数。 */
      props?: unknown;
    }
  | {
      /** 控件类型，使用 render 函数接管字段渲染。 */
      type: 'custom';
      /** 自定义渲染函数；未提供时会回退展示当前值字符串。 */
      render?: (props: {
        /** 当前字段值。 */
        modelValue: unknown;
        /** 更新当前字段值的回调。 */
        'onUpdate:modelValue': (val: unknown) => void;
      }) => VNode;
    }
  | {
      /** 控件类型，渲染 Element Plus Button。 */
      type: 'button';
      /** 按钮显示文案。 */
      text: string;
      /** 透传给 Element Plus Button 的属性。 */
      props?: InstanceType<typeof ElButton>['$props'];
    }
  | {
      /** 控件类型，渲染 Element Plus Select。 */
      type: 'select';
      /** select 选项来源，函数形式会在控件加载选项时执行。 */
      options: SchemaFormOptionsSource<SchemaFormOption[]>;
      /** 透传给 Element Plus Select 的属性，modelValue 由 schema-form 维护。 */
      props?: Omit<InstanceType<typeof ElSelect>['$props'], 'modelValue'>;
      /** 是否延迟加载选项；函数形式返回本次加载使用的选项。 */
      lazy?: SchemaFormLazyOptions<SchemaFormOption[]>;
    }
  | {
      /** 控件类型，渲染 Element Plus DatePicker。 */
      type: 'date-picker';
      /** 透传给 Element Plus DatePicker 的属性，modelValue 由 schema-form 维护。 */
      props?: Omit<InstanceType<typeof ElDatePicker>['$props'], 'modelValue'>;
    }
  | {
      /** 控件类型，渲染 Element Plus CheckboxGroup。 */
      type: 'check-box-group';
      /** checkbox 选项来源。 */
      options: SchemaFormOptionsSource<SchemaFormOption[]>;
      /** 透传给 Element Plus CheckboxGroup 的属性，modelValue 由 schema-form 维护。 */
      props?: Omit<
        InstanceType<typeof ElCheckboxGroup>['$props'],
        'modelValue'
      >;
    }
  | {
      /** 控件类型，渲染 Element Plus Switch。 */
      type: 'switch';
      /** 透传给 Element Plus Switch 的属性，modelValue 由 schema-form 维护。 */
      props?: Omit<InstanceType<typeof ElSwitch>['$props'], 'modelValue'>;
    }
  | {
      /** 控件类型，渲染 Element Plus Cascader。 */
      type: 'cascader';
      /** cascader 选项来源。 */
      options: SchemaFormOptionsSource<SchemaFormCascaderOptions>;
      /** 透传给 Element Plus Cascader 的属性，modelValue 由 schema-form 维护。 */
      props?: Omit<InstanceType<typeof ElCascader>['$props'], 'modelValue'>;
      /** 是否延迟加载选项；函数形式返回本次加载使用的选项。 */
      lazy?: SchemaFormLazyOptions<SchemaFormCascaderOptions>;
    }
  | {
      /** 控件类型，渲染 Element Plus Input。 */
      type: 'input';
      /** 透传给 Element Plus Input 的属性，modelValue 由 schema-form 维护。 */
      props?: Omit<InstanceType<typeof ElInput>['$props'], 'modelValue'>;
    }
  | {
      /** 控件类型，渲染 Element Plus InputNumber。 */
      type: 'input-number';
      /** 透传给 Element Plus InputNumber 的属性，modelValue 由 schema-form 维护。 */
      props?: Omit<InstanceType<typeof ElInputNumber>['$props'], 'modelValue'>;
    }
  | {
      /** 控件类型，渲染 Element Plus RadioGroup。 */
      type: 'radio-group';
      /** radio 选项来源。 */
      options: SchemaFormOptionsSource<SchemaFormOption[]>;
      /** 透传给 Element Plus RadioGroup 的属性，modelValue 由 schema-form 维护。 */
      props?: Omit<InstanceType<typeof ElRadioGroup>['$props'], 'modelValue'>;
    };

/** 字段运行时上下文，函数式 props 会通过它读取当前表单和字段配置。 */
export interface SchemaFormColumnCtx<T extends SchemaFormModel> {
  /** 当前完整表单值。 */
  form: T;
  /** 当前 column 原始配置。 */
  column: SchemaFormColumn<T>;
  /** 字段当前值。 */
  value: unknown;
  /** 字段路径。 */
  dataIndex: SchemaFormDataIndex<T>;
}

/** 异步选项请求上下文，keyword 来自远程搜索输入。 */
export interface SchemaFormRequestCtx<T extends SchemaFormModel>
  extends SchemaFormColumnCtx<T> {
  /** 当前远程搜索关键字。 */
  keyword?: string;
}

/** 自定义字段渲染上下文。 */
export interface SchemaFormRenderCtx<T extends SchemaFormModel>
  extends SchemaFormColumnCtx<T> {
  /** 字段是否禁用。 */
  disabled: boolean;
  /** 字段是否只读。 */
  readonly: boolean;
  /** 标准化选项。 */
  options: SchemaFormOption[];
  /** 选项是否加载中。 */
  loading: boolean;
  /** 更新当前字段值。 */
  setValue: (value: unknown) => void;
  /** 触发当前字段选项重新加载。 */
  loadOptions: (keyword?: string) => void;
}

/** 表单项属性，最终会映射到 Element Plus `ElFormItem`。 */
export type SchemaFormItemProps = Partial<
  Omit<InstanceType<typeof ElFormItem>['$props'], 'label' | 'prop'>
>;

/** Element Plus 表单属性，组件会自己维护 model，不允许外部覆盖。 */
export type SchemaFormElProps = Partial<
  Omit<InstanceType<typeof ElForm>['$props'], 'model'>
>;

/** 控件属性，允许传给不同 Element Plus 控件，因此使用宽松记录类型。 */
export type SchemaFieldProps =
  | Record<string, unknown>
  | ((ctx: SchemaFormColumnCtx<SchemaFormModel>) => Record<string, unknown>);

/** 字段布局配置，用于控制字段在 grid 中的跨度和偏移。 */
export interface SchemaFormColProps {
  /** 占用列数。 */
  span?: number;
  /** 开始前跳过的列数。 */
  offset?: number;
  /** 是否占满整行。 */
  full?: boolean;
}

/** 查询模式下的字段配置。 */
export type SchemaFormColumnSearch<T extends SchemaFormModel> =
  | false
  | {
      /** 查询字段排序，值越小越靠前。 */
      order?: number;
      /** 收起状态下是否隐藏该字段。 */
      collapsed?: boolean;
      /** 提交查询时的字段转换函数。 */
      transform?: (value: unknown, form: T) => Record<string, unknown>;
    };

/** 普通编辑表单模式下的字段配置。 */
export type SchemaFormColumnForm =
  | false
  | {
      /** 预留普通表单字段配置，当前用于表达是否参与 form 模式。 */
      enabled?: boolean;
    };

/** 字段 schema 配置，参考 antd-pro columns，但面向 Vue 和 Element Plus。 */
export interface SchemaFormColumn<T extends SchemaFormModel = SchemaFormModel> {
  /** 字段路径，决定从 modelValue 中读取和写入的位置。 */
  dataIndex: SchemaFormDataIndex<T>;
  /** 字段标题，会作为默认 label 渲染。 */
  title?: string;
  /** 新 schema 的控件类型。 */
  valueType?: SchemaValueType;
  /** schema-form 控件配置；存在时优先于 valueType。 */
  data?: SchemaFormControlData;
  /** 静态枚举选项，适用于 select/radio/checkbox。 */
  valueEnum?: Record<string, string | { text: string; disabled?: boolean }>;
  /** 异步选项请求函数。 */
  request?: (ctx: SchemaFormRequestCtx<T>) => Promise<SchemaFormOption[]>;
  /** 明确触发 request 重新加载的字段路径。 */
  reloadOn?: SchemaFormDataIndex<T>[];
  /** 传给具体控件的 props。 */
  fieldProps?:
    | Record<string, unknown>
    | ((ctx: SchemaFormColumnCtx<T>) => Record<string, unknown>);
  /** 传给 `ElFormItem` 的 props。 */
  formItemProps?:
    | SchemaFormItemProps
    | ((ctx: SchemaFormColumnCtx<T>) => SchemaFormItemProps);
  /** 字段栅格布局。 */
  colProps?: SchemaFormColProps;
  /** 查询表单配置；为 false 时不参与 search 模式。 */
  search?: SchemaFormColumnSearch<T>;
  /** 普通表单配置；为 false 时不参与 form 模式。 */
  form?: SchemaFormColumnForm;
  /** 是否隐藏字段，函数形式会随 Vue 响应式更新。 */
  hidden?: boolean | ((ctx: SchemaFormColumnCtx<T>) => boolean);
  /** 是否禁用字段，函数形式会随 Vue 响应式更新。 */
  disabled?: boolean | ((ctx: SchemaFormColumnCtx<T>) => boolean);
  /** 是否只读字段；不支持 readonly 的控件会降级为 disabled。 */
  readonly?: boolean | ((ctx: SchemaFormColumnCtx<T>) => boolean);
  /** 自定义字段渲染函数，优先级高于内置 renderer。 */
  renderFormItem?: (ctx: SchemaFormRenderCtx<T>) => VNode | string | null;
}

/** 查询表单自定义动作。 */
export interface SchemaFormAction {
  /** 动作唯一标识，会随 action 事件返回。 */
  key: string;
  /** 按钮显示文案。 */
  text: string;
  /** Element Plus 按钮类型。 */
  type?: InstanceType<typeof ElButton>['$props']['type'];
  /** 是否禁用动作按钮。 */
  disabled?: boolean;
  /** 是否显示 loading。 */
  loading?: boolean;
}

/** 查询表单配置，控制按钮区、列数和展开收起行为。 */
export interface SchemaFormSearch {
  /** 每行列数。 */
  columns?: SchemaFormColumns;
  /** 默认是否收起。 */
  defaultCollapsed?: boolean;
  /** 收起时显示的行数。 */
  collapsedRows?: number;
  /** 搜索按钮文字。 */
  submitText?: string;
  /** 重置按钮文字。 */
  resetText?: string;
  /** 是否显示重置按钮。 */
  showReset?: boolean;
  /** 是否显示展开收起按钮。 */
  showCollapse?: boolean;
  /** 展开按钮是否显示当前被隐藏的字段数量。 */
  showHiddenNum?: boolean;
  /** 动作区位置。 */
  actionPlacement?: 'inline' | 'bottom';
  /** 动作区对齐方式。 */
  actionAlign?: 'left' | 'right';
  /** 额外动作按钮。 */
  actions?: SchemaFormAction[];
}

/** 表单布局配置，普通表单和查询表单共享。 */
export interface SchemaFormLayout {
  /** 默认列数。 */
  columns?: SchemaFormColumns;
  /** 栅格间距，数字按 px 处理。 */
  gap?: number | string;
  /** label 位置；不传时查询表单桌面端默认右侧宽度内右对齐，窄屏默认置顶。 */
  labelPosition?: 'left' | 'right' | 'top';
  /** 默认 label 宽度。 */
  labelWidth?: number | string;
}

/** 组件级字段默认值，会在单字段配置缺省时生效。 */
export interface SchemaFormFieldDefaults {
  /** 默认控件 props。 */
  fieldProps?: Record<string, unknown>;
  /** 默认表单项 props。 */
  formItemProps?: SchemaFormItemProps;
}

/** `VSchemaForm` props，columns 是唯一 schema 入口。 */
export interface SchemaFormProps<T extends SchemaFormModel = SchemaFormModel> {
  /** 表单值。 */
  modelValue: T;
  /** 字段 schema。 */
  columns: SchemaFormColumn<T>[];
  /** 表单模式，默认普通 form。 */
  mode?: SchemaFormMode;
  /** 通用布局配置。 */
  layout?: SchemaFormLayout;
  /** 查询表单配置；为 false 时禁用查询动作区。 */
  search?: false | SchemaFormSearch;
  /** 字段默认配置。 */
  fieldDefaults?: SchemaFormFieldDefaults;
  /** Element Plus Form props。 */
  formProps?: SchemaFormElProps;
  /** 重置目标值；未提供时使用挂载时 modelValue 快照。 */
  initialValues?: Partial<T>;
  /** 是否禁用整个表单。 */
  disabled?: boolean;
  /** 是否只读整个表单。 */
  readonly?: boolean;
  /** 受控收起状态，用于 `v-model:collapsed`。 */
  collapsed?: boolean;
}

/** 组件事件定义。 */
export interface SchemaFormEmits<T extends SchemaFormModel = SchemaFormModel> {
  /** 更新表单值。 */
  (event: 'update:modelValue', value: T): void;
  /** 更新收起状态。 */
  (event: 'update:collapsed', value: boolean): void;
  /** 查询提交，返回转换后的参数和原始表单。 */
  (event: 'submit', params: Record<string, unknown>, rawForm: T): void;
  /** 重置完成。 */
  (event: 'reset', form: T): void;
  /** 自定义动作触发。 */
  (event: 'action', actionKey: string, form: T): void;
}

/** 对外暴露的方法，方便弹窗和查询页用 ref 触发组件行为。 */
export interface SchemaFormExpose {
  /** 执行 Element Plus 表单校验。 */
  validate: () => ReturnType<InstanceType<typeof ElForm>['validate']>;
  /** 校验指定字段。 */
  validateField: InstanceType<typeof ElForm>['validateField'];
  /** 重置 Element Plus 字段状态。 */
  resetFields: InstanceType<typeof ElForm>['resetFields'];
  /** 清空校验状态。 */
  clearValidate: InstanceType<typeof ElForm>['clearValidate'];
  /** 执行查询提交行为。 */
  submit: () => void;
  /** 执行组件重置行为。 */
  reset: () => void;
  /** 切换查询表单收起状态。 */
  toggleCollapsed: () => void;
}

/** 标准化字段，供布局、渲染和选项模块消费。 */
export interface NormalizedSchemaFormColumn<
  T extends SchemaFormModel = SchemaFormModel,
> {
  /** 字段稳定 key，来自 dataIndex。 */
  key: string;
  /** 原始字段路径。 */
  dataIndex: SchemaFormDataIndex<T>;
  /** 原始 column 配置。 */
  column: SchemaFormColumn<T>;
  /** 字段标题。 */
  title?: string;
  /** 标准化后的控件类型。 */
  valueType: SchemaValueType;
  /** 是否使用 column.data 控件配置渲染。 */
  useDataControl: boolean;
  /** 原始顺序，用于稳定排序。 */
  index: number;
}

/** 字段运行时状态，合并了动态函数配置和组件级默认值。 */
export interface RuntimeSchemaFormField<T extends SchemaFormModel = SchemaFormModel>
  extends NormalizedSchemaFormColumn<T> {
  /** 当前值。 */
  value: unknown;
  /** 是否隐藏。 */
  hidden: boolean;
  /** 是否禁用。 */
  disabled: boolean;
  /** 是否只读。 */
  readonly: boolean;
  /** 合并后的控件 props。 */
  fieldProps: Record<string, unknown>;
  /** 合并后的表单项 props。 */
  formItemProps: SchemaFormItemProps;
}

/** 布局后的字段项，包含 CSS grid 位置和收起可见性。 */
export interface SchemaFormLayoutItem<T extends SchemaFormModel = SchemaFormModel> {
  /** 字段运行时状态。 */
  field: RuntimeSchemaFormField<T>;
  /** 字段所在行，从 0 开始。 */
  row: number;
  /** 字段 CSS 样式。 */
  style: CSSProperties;
  /** 收起状态下是否仍然可见。 */
  visibleWhenCollapsed: boolean;
}

/** 渲染器上下文，内部 renderer 根据它创建 VNode。 */
export interface SchemaRendererCtx<T extends SchemaFormModel = SchemaFormModel>
  extends SchemaFormRenderCtx<T> {
  /** 当前字段运行时状态。 */
  field: RuntimeSchemaFormField<T>;
  /** 远程搜索关键字更新函数。 */
  setKeyword: (keyword: string) => void;
}

/** 支持的 Element Plus 控件 props 片段，供 renderer 保持基本类型提示。 */
export type SchemaKnownControlProps =
  | InstanceType<typeof ElInput>['$props']
  | InstanceType<typeof ElInputNumber>['$props']
  | InstanceType<typeof ElSelect>['$props']
  | InstanceType<typeof ElDatePicker>['$props']
  | InstanceType<typeof ElSwitch>['$props']
  | InstanceType<typeof ElCheckboxGroup>['$props']
  | InstanceType<typeof ElRadioGroup>['$props']
  | InstanceType<typeof ElCascader>['$props'];

/** 字段 slot props，提供给 `#field-*`、`#label-*` 和 `#actions` 等 slot。 */
export interface SchemaFormSlotProps<T extends SchemaFormModel = SchemaFormModel> {
  /** 当前完整表单。 */
  form: T;
  /** 当前字段；actions slot 中没有字段时为 undefined。 */
  field?: RuntimeSchemaFormField<T>;
  /** 当前字段值。 */
  value?: unknown;
  /** 更新字段值。 */
  setValue?: (value: unknown) => void;
  /** 提交查询。 */
  submit: () => void;
  /** 重置表单。 */
  reset: () => void;
  /** 当前是否收起。 */
  collapsed: boolean;
  /** 切换收起状态。 */
  toggleCollapsed: () => void;
}

/** 动态组件类型，用于 component/custom 控件传入 Vue 组件。 */
export type SchemaFormComponent = Component;
