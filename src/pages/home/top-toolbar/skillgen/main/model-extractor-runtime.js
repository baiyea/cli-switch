const { createSkillgenModelExtractor } = require('./model-extractor.service');

function createSkillgenModelExtractorRuntime(deps = {}) {
  let modelExtractor = null;

  function extractSkillCandidatesWithModel(payload) {
    if (!modelExtractor) {
      modelExtractor = createSkillgenModelExtractor(deps);
    }
    return modelExtractor(payload);
  }

  return {
    extractSkillCandidatesWithModel,
  };
}

module.exports = {
  createSkillgenModelExtractorRuntime,
};
