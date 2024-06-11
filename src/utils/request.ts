// import qs from 'qs';
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse, Method } from 'axios';
export interface RequestCustomConfigType {
  // 请求域名地址
  baseURL?: string;
  // 请求超时时间
  timeout?: number;
  // 是否需要token
  isNeedToken?: boolean;
  // 设置token的keyName
  headerTokenKey?: string;
  // 设置请求拦截回调方法
  beforeRequest?: (config: AxiosRequestConfig) => void;
  // 设置响应拦截回调方法
  afterResponse?: (response: AxiosResponse) => void;
  // 自定义头部字段
  customHeader?: any;
  // 激活接口loading的状态
  loading?: boolean;
  // loading的全局回调接口
  loadingCallback?: (loading: boolean) => void;
  // 设置无权限code，默认：401
  noPermissionCode?: number | string;
  // 设置refreshToken的请求参数
  refreshConfig?: RequestParamsType;
  // 请求key
  requestKey?: string;
  // token前缀
  prefix?: string;
}

export interface RequestParamsType {
  url: string;
  method?: Method;
  params?: any;
  body?: any;
  options?: AxiosRequestConfig;
  config?: RequestCustomConfigType;
  success?: (data: any) => string;
  error?: () => void;
}
// 自定义请求配置
export interface interceptorsRequestConfig extends AxiosRequestConfig, RequestCustomConfigType {
  requestKey: string;
}

class InterfaceInstance {
  axiosInstance: AxiosInstance; // 实例
  constructor(config?: AxiosRequestConfig) {
    this.axiosInstance = this.createInstance(config); // 创建实例
  }
  /**
   * 创建axios实例
   * @param config 基础配置
   * @returns void
   */
  createInstance(config?: AxiosRequestConfig) {
    return axios.create(config || {});
  }

  /**
   * 设置请求拦截
   */
  interceptorsRequest(callback = (config: AxiosRequestConfig): AxiosRequestConfig => config) {
    this.axiosInstance.interceptors.request.use((config: any) => {
        // 在发送请求之前做些什么
        const _config: any = callback(config)
        return _config;
      },
      (error: AxiosError) => {
        // 对请求错误做些什么
        return Promise.reject(error);
      },
    );
  }

  /**
   * 设置响应拦截
   */
  interceptorsResponse(callback = (response: AxiosResponse): AxiosResponse => response, errorCatch = (error: AxiosError) => {}) {
    this.axiosInstance.interceptors.response.use(
      (response: any) => {
        // 对响应数据做点什么
        const _response: any = callback(response)
        return _response;
      },
      (error: AxiosError) => {
        return errorCatch(error);
      },
    );
  }
}

class JAxios {
  token: string; // token信息
  defaultConfig: RequestCustomConfigType; // 基础配置信息
  interface: any; // axios实例
  loadingMap: Map<any, any>; // loading map数组
  pendingMap: Map<any, any>; // loading map数组
  reloadRequest: Function[]; // 等待请求队列
  isBlocking: boolean; // 等待请求队列
  tokenKey: string;
  constructor(config: RequestCustomConfigType = {}) {
    this.token = '';
    this.defaultConfig = config;
    this.interface = new InterfaceInstance(config);
    this.reloadRequest = [];
    this.loadingMap = new Map();
    this.pendingMap = new Map();
    this.isBlocking = false;
    this.tokenKey = `${config.prefix || ''}_AUTH_TOKEN_`.toLocaleUpperCase()
    // 检测请求拦截配置
    this.interface.interceptorsRequest((_config: interceptorsRequestConfig) => {
      this.removePendingMap(_config); // 检查是否存在重复请求，若存在则取消已发的请求
      this.addPendingMap(_config); // 把当前请求信息添加到pendingRequest对象中
      // 检测是否插入token, 浏览器储存的headerTokenKey与返回的header中的key一致
      if (_config.isNeedToken) {
        if (
          this.token ||
          (window as any).localStorage.getItem(this.tokenKey) ||
          (window as any).sessionStorage.getItem(this.tokenKey)
        ) {
          _config.headers = {
            ..._config.headers,
            [(_config.headerTokenKey as string) || 'Authorization']:
              this.token ||
              (window as any).localStorage.getItem(this.tokenKey) ||
              (window as any).sessionStorage.getItem(this.tokenKey),
          };
        } else {
          console?.warn('温馨提示: 在缓存中检测不到_AUTH_TOKEN_, 请通过setToken方法设置_AUTH_TOKEN_再重试。');
        }
      }
      // 标记请求拦截中的loading
      _config.loading && this.handleLoading(true, _config.requestKey, this.defaultConfig.loadingCallback);
      // 返回自定义相应拦截的对象实例
      return this.defaultConfig.beforeRequest && (this.defaultConfig.beforeRequest as Function)(_config);
    });
    // 检测响应拦截配置
    this.interface.interceptorsResponse(
      (response: AxiosResponse) => {
        const config = response.config as interceptorsRequestConfig;
        // 消除响应拦截中的loading
        config.loading && this.handleLoading(false, config.requestKey, this.defaultConfig.loadingCallback);
        return this.defaultConfig.afterResponse && (this.defaultConfig.afterResponse as Function)(response);
      },
      (error: AxiosError) => {
        if (error.response) {
          const config = error.response?.config as interceptorsRequestConfig;
          // 判断当前的状态是否等于token的过期时间
          if (
            error.response?.status === (config?.noPermissionCode || 401) &&
            config?.refreshConfig &&
            error.response?.config.url !== config?.refreshConfig?.url
          ) {
            return this.handleUnauthorizedToken(error.response?.config);
          } else {
            console?.warn(JSON.stringify(error.response?.data) || '操作失败')
          }
        }
        config?.loading && this.handleLoading(false, config.requestKey, this.defaultConfig.loadingCallback);
        return Promise.reject(error);
      },
    );
  }
  /**
   * 保存token
   * @param token token
   */
  setToken(token = '') {
    (window as any).localStorage.setItem(this.tokenKey, token);
    this.token = token;
  }
  /**
   * 清除token
   * @param token token
   */
  clearToken() {
    (window as any).localStorage.removeItem(this.tokenKey);
    this.token = '';
  }

  /**
   * 处理loading
   * @param loading 当前loading状态
   * @param requestKey 请求唯一key
   * @param loadingMap loadingMap
   * @param callback 回调方法
   * @returns
   */
  private handleLoading(loading: boolean, requestKey: string, callback = (loading: boolean) => {}) {
    if (loading) {
      // 存储处于loading的请求
      this.loadingMap.set(requestKey, true);
      // 如果当前无loading中的的接口，则回调方法false
      if (this.loadingMap.size === 1) {
        callback?.(true);
      }
      return;
    }
    if (this.loadingMap.has(requestKey)) {
      // 删除loading的请求
      this.loadingMap.delete(requestKey);
      // 如果当前无loading中的的接口，则回调方法false
      if (this.loadingMap.size === 0) {
        callback?.(false);
      }
    }
  }

  // 处理token过期
  private handleUnauthorizedToken(config: any) {
    // 日志输出
    console?.warn('温馨提示：Token过期');
    // 判断当前的等待状态
    if (this.isBlocking) {
      return new Promise((resolve, reject) => {
        this.reloadRequest.push(() => {
          resolve(this.interface.axiosInstance.request(config));
        });
      });
    } else {
      // 设置等待状态
      this.isBlocking = true;
      // 请求refresh接口
      return this.request(
        {
          method: this.defaultConfig.refreshConfig?.method,
          url: this.defaultConfig.refreshConfig?.url,
          params: this.defaultConfig.refreshConfig?.params,
          ...this.defaultConfig.refreshConfig?.options,
        },
        this.defaultConfig.refreshConfig?.config,
      )
        .then((res: any) => {
          // 取消等待状态
          this.isBlocking = false;
          // 获取新token
          const newToken = this.defaultConfig.refreshConfig?.success(res.data);
          if (!newToken) {
            this.defaultConfig.refreshConfig?.error();
            return Promise.resolve('');
          }
          // 保存token
          this.setToken(`Bearer ${newToken}`);
          // 遍历等待列表中的接口
          this.reloadRequest.forEach((item) => item());
          this.reloadRequest = [];
          return this.interface.axiosInstance.request(config);
        })
        .catch((err) => {
          this.defaultConfig.refreshConfig?.error();
          this.clearToken();
          return Promise.resolve(err);
        })
        .finally(() => {
          // 取消等待状态
          this.isBlocking = false;
        });
    }
  }

  /**
   * 获取请求的唯一key
   * @param config 请求配置
   * @returns 请求的唯一key
   */
  private generateReqKey(config: AxiosRequestConfig) {
    const { method, url, params, data } = config;
    return [method, url, JSON.stringify(params), JSON.stringify(data)].join('_');
  }

  private addPendingMap(config: AxiosRequestConfig) {
    const requestKey = this.generateReqKey(config);
    config.cancelToken =
      config.cancelToken ||
      new axios.CancelToken((cancel) => {
        if (!this.pendingMap.has(requestKey)) {
          this.pendingMap.set(requestKey, cancel);
        }
      });
  }
  private removePendingMap(config: AxiosRequestConfig) {
    const requestKey = this.generateReqKey(config);
    if (this.pendingMap.has(requestKey)) {
      const cancelToken = this.pendingMap.get(requestKey);
      cancelToken(requestKey);
      this.pendingMap.delete(requestKey);
    }
  }

  /**
   * 格式化请求前的配置信息，返回格式化后的config
   * @param requestConfig 请求配置项
   * @param customConfig 通用配置项
   * @returns 返回更新后的请求配置信息
   */
  private handleBeforeRequest(
    requestConfig: AxiosRequestConfig,
    customConfig: RequestCustomConfigType,
  ): AxiosRequestConfig {
    // 每个请求的唯一key
    const requestKey = this.generateReqKey(requestConfig);
    let _config: any = requestConfig;
    _config.requestKey = requestKey;
    // 自定义请求头
    if (customConfig.customHeader) {
      _config.headers = {
        ..._config.headers,
        ...customConfig.customHeader,
      };
    }
    return _config;
  }

  /**
   * 基础请求方法设置
   * @param config 请求的配置信息
   * @param customConfig 获取个性化设置的配置信息 - RequestCustomConfigType
   * @returns 返回一个接口结果
   */
  private async request(
    requestConfig: AxiosRequestConfig,
    customConfig?: RequestCustomConfigType,
  ): Promise<AxiosResponse> {
    // 返回请求结果
    return this.interface.axiosInstance.request(
      this.handleBeforeRequest(requestConfig, {
        ...this.defaultConfig,
        ...customConfig,
      }),
    );
  }

  /**
   * GET 请求
   * @param config 请求配置项
   * @returns 返回请求结果
   */
  async get<T>(config: RequestParamsType): Promise<AxiosResponse<T>> {
    return this.request(
      {
        method: 'GET',
        url: config.url,
        params: config.params,
        ...config.options,
      },
      config.config,
    ).then((res) => res?.data);
  }

  /**
   * POST 请求
   * @param config 请求配置项
   * @returns 返回请求结果
   */
  async post<T>(config: RequestParamsType): Promise<AxiosResponse<T>> {
    return this.request(
      {
        method: 'POST',
        url: config.url,
        data: config.params,
        ...config.options,
      },
      config.config,
    ).then((res) => res?.data);
  }
  /**
   * PUT 请求
   * @param config 请求配置项
   * @returns 返回请求结果
   */
  async put<T>(config: RequestParamsType): Promise<AxiosResponse<T>> {
    return this.request(
      {
        method: 'PUT',
        url: config.url,
        data: config.params,
        ...config.options,
      },
      config.config,
    ).then((res) => res?.data);
  }
  /**
   * DELETE 请求
   * @param config 请求配置项
   * @returns 返回请求结果
   */
  async delete<T>(config: RequestParamsType): Promise<AxiosResponse<T>> {
    return this.request(
      {
        method: 'DELETE',
        url: config.url,
        data: config.params,
        ...config.options,
      },
      config.config,
    ).then((res) => res?.data);
  }
  /**
   * Form 请求
   * @param config 请求配置项
   * @returns 返回请求结果
   */
  async form<T>(config: RequestParamsType): Promise<AxiosResponse<T>> {
    return this.request(
      {
        method: 'POST',
        url: config.url,
        params: config.params,
        ...config.options,
      },
      {
        ...config.config,
        customHeader: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    ).then((res) => res?.data);
  }
  /**
   * upload 请求
   * @param config 请求配置项
   * @returns 返回请求结果
   */
  async upload<T>(config: RequestParamsType): Promise<AxiosResponse<T>> {
    const toFormData = function (params: any = {}) {
      const formData = new FormData();
      Object.keys(params).forEach((key) => {
        formData.append(key, params[key]);
      });
      return formData;
    };
    const fromData = toFormData(Object.assign(config.params));

    return this.request(
      {
        method: 'POST',
        url: config.url,
        data: fromData,
        ...config.options,
      },
      {
        ...config.config,
        customHeader: {
          'Content-Type': 'multipart/form-data',
        },
      },
    ).then((res) => res?.data);
  }
  /**
   * download 请求
   * @param config 请求配置项
   * @returns 返回请求结果
   */
  async download(config: RequestParamsType): Promise<AxiosResponse> {
    return this.request({
      method: config.method || 'GET',
      url: config.url,
      params: config.params,
      ...config.options,
      ...{
        responseType: 'blob',
      },
    }).then((res) => res);
  }
}

export default JAxios;