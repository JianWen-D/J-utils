import React, { useEffect } from "react";
import { JAxios } from "./../src/index";

interface responseType<T> {
  code: number;
  data: T;
  msg: string | undefined;
}

const request = new JAxios({
  baseURL: "http://localhost:7001",
  noPermissionCode: 401,
  isNeedToken: true,
  timeout: 1000,
  // handleBeforeRequest: (config) => {
  //   return config;
  // },
  // handleAfterResponse: (response) => {
  //   return response;
  // },
  refreshRequet: (callback) => {
    request
      .get<responseType<string>>({
        url: "/refreshToken",
      })
      .then((res) => {
        request.setToken(res.data);
        callback();
      });
  },
  retryConfig: {
    wait: 2000,
    count: 3,
  },
});

export default () => {
  const fetchGet = async (num) => {
    const result = await request.get<responseType<string>>({
      url: "/test/" + num,
    });
    if (result.code === 200) {
      console.log(result);
    }
  };

  useEffect(() => {
    fetchGet(1);
    fetchGet(1);
    fetchGet(2);
    // setTimeout(() => {
    //   fetchGet(2);
    // }, 500);
    // setTimeout(() => {
    //   fetchGet(3);
    // }, 1000);
  }, []);
  return <div>App</div>;
};
