declare module 'mjml-browser' {
  interface MJMLParseError {
    line: number;
    message: string;
    tagName: string;
    formattedMessage: string;
  }

  interface MJMLParseResults {
    html: string;
    errors: MJMLParseError[];
  }

  interface MJMLOptions {
    fonts?: Record<string, string>;
    keepComments?: boolean;
    beautify?: boolean;
    minify?: boolean;
    validationLevel?: 'strict' | 'soft' | 'skip';
    filePath?: string;
  }

  function mjml2html(mjml: string, options?: MJMLOptions): MJMLParseResults;

  export default mjml2html;
}
