import { useRef } from 'react';
import { Editor } from '@tinymce/tinymce-react';

export default function EmailEditor({ value, onChange, editorRef, inEditMode }) {
  return (
    <Editor
      apiKey="aey5gidye4slr7dcp1y1qaqndtgjhach4zg0u66jhnzv00gs"
      onInit={(evt, editor) => {
        if (editorRef) {
          editorRef.current = editor;
        }
      }}
      initialValue={inEditMode ? value : `<table align="center" style="width:600px; margin:auto; height:100%;">
  <tbody>
    <tr>
      <td style="background:#ffffff; padding:0 40px; text-align:center; border-bottom:1px solid #e5e7eb;">
        <div style="padding:20px 0;">
          <h2 style="font-size:30px; font-weight:bold; color:#F8285A; margin:0;">
            Edit Title
          </h2>
        </div>
      </td>
    </tr>
    <tr>
      <td style="background:#ffffff; padding:0 40px; border-bottom:1px solid #e5e7eb;">
        <div style="padding:40px 0;">
          <h3 style="font-size:24px; color:#1f2937; text-align:center; margin-bottom:8px;">
            Dear Admin
          </h3>
          <p style="font-size:14px; color:#4b5563; line-height:20px; margin-bottom:24px;">
            write the paragraph here
          </p>
          <table style="width:100%; border:1px solid #d1d5db; border-collapse:collapse; font-size:14px;">
            <tbody>
              <tr>
                <td style="border:1px solid #d1d5db; padding:8px; font-weight:600; width:40%;">key 1</td>
                <td style="border:1px solid #d1d5db; padding:8px;">{value_one}</td>
              </tr>
              <tr>
                <td style="border:1px solid #d1d5db; padding:8px; font-weight:600;">key 2</td>
                <td style="border:1px solid #d1d5db; padding:8px;">{value_two}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  </tbody>
</table>`}
      value={value}
      onEditorChange={(content) => onChange(content)}
      init={{
        height: 500,
        menubar: true,
        statusbar: true,
        branding: false,
        plugins: [
          'anchor',
          'autolink',
          'charmap',
          'codesample',
          'emoticons',
          'link',
          'lists',
          'media',
          'searchreplace',
          'table',
          'visualblocks',
          'wordcount',
          'checklist',
          'mediaembed',
          'casechange',
          'formatpainter',
          'powerpaste',
          'advtable',
          'advcode',
          'mergetags',
        ],
        toolbar:
          'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | link media table mergetags | align lineheight | checklist numlist bullist indent outdent | emoticons charmap | removeformat',
        toolbar_sticky: false,
        mergetags_list: [
          { value: 'First.Name', title: 'First Name' },
          { value: 'Email', title: 'Email' },
        ],
      }}
    />
  );
}
