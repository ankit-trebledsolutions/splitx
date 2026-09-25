import { useParams } from 'react-router-dom';
import defaultLogo from '../../../../../dist/media/app/default-logo.svg';
import facebook from '../../../../../dist/media/brand-logos/facebook.svg';
import instagram from '../../../../../dist/media/brand-logos/instagram.svg';
import x from '../../../../../dist/media/brand-logos/x.svg';
import youtube from '../../../../../dist/media/brand-logos/youtube.svg';
import { useGetEmailTemplateByIdQuery } from '@/features/email-template/emailTemplateApi';

const EmailPage = () => {
  const { id } = useParams();
  const { data, isLoading } = useGetEmailTemplateByIdQuery(id, {
    skip: !id,
  });
  const templateData = data?.data;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading template...</div>
      </div>
    );
  }

  if (!templateData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Template not found</div>
      </div>
    );
  }

  return (
    <>
      <table class="w-full bg-[#f5f5f5] text-gray-800 leading-6 font-sans h-[100vh] overflow-y-auto">
        <tbody>
          <tr>
            <td class="bg-[#F8285A] py-8"></td>
          </tr>
          <tr>
            <td class="bg-[#F8285A]">
              <table class="bg-white border-b h-full border-gray-200 mx-auto w-[600px] ">
                <tr>
                  <td class="px-10 py-5">
                    <a href="#">
                      <img src={defaultLogo} alt="metronic" />
                    </a>
                  </td>
                  <td class="text-right px-10 py-10">
                    <div class="inline-flex gap-2">
                      <a href="#">
                        <img class="w-6 h-6" src={facebook} />
                      </a>
                      <a href="#">
                        <img class="w-6 h-6" src={x} />
                      </a>
                      <a href="#">
                        <img class="w-6 h-6" src={instagram} />
                      </a>
                      <a href="#">
                        <img class="w-6 h-6" src={youtube} />
                      </a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td
              dangerouslySetInnerHTML={{
                __html:
                  templateData?.body ||
                  '<p>Email content will appear here...</p>',
              }}
            ></td>
          </tr>
          <tr>
            <td>
              <table class="mx-auto w-[600px] h-full">
                <tr>
                  <td class="bg-black/5 px-8 text-center">
                    <div class="py-8 text-lg text-black">
                      Need more help?
                      <br />
                      <a href="#" class="text-[#F8285A]">
                        We’re here, ready to talk
                      </a>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td class="bg-black/5 px-10 text-center text-sm text-gray-500">
                    <div class="py-6">
                      Be sure to add
                      <a href="#" class="text-[#F8285A]">
                        platform@dummyid.com
                      </a>
                      to your address book or safe sender list so our emails get
                      to your inbox.
                      <br />
                      <br />© 2026, Metronic. All Rights Reserved.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td class="h-12"></td>
                </tr>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
};

export default EmailPage;
